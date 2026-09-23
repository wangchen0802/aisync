import "server-only";
import { one, q, tx } from "@/lib/db";
import { aiEnabled, distillHeuristic, distillWithAI, findRelations, redact, type Distilled } from "@/lib/ai";
import { addDays, code, DECISION_STATUS, estimateTokens, fmtDay, fmtDue, parseDue, type Subtask, TASK_STATUS, todayISO, weekStart } from "@/lib/meta";
import { dmUser, notify } from "@/lib/notify";

export type Actor = { id: number; name: string; email: string; role: string };

export type AckRow = { user_id: number; name: string; verdict: "agree" | "object"; comment: string | null };
export type ItemRow = {
  id: number; kind: string; title: string; body: string; status: string; visibility: string;
  details: { alternatives?: string[]; quote?: string; assignee?: string; sensitive?: boolean; task_id?: number; done_subtasks?: string[]; new_status?: string; note?: string; reason?: string; converted_to?: number };
  owner_id: number | null; owner_name: string | null; assignee_id: number | null; assignee_name: string | null;
  project_id: number | null; project_name: string | null; project_color: string | null;
  conversation_id: number | null; source: string; due: string | null; subtasks: Subtask[];
  conflict_with: number | null; superseded_by: number | null; blocked_by: number | null; duplicate_of: number | null;
  last_update: string | null; last_update_at: string | null; last_update_source: string | null; created_at: string; updated_at: string;
  due_date: string | null; goal_id: number | null; completed_at: string | null;
  acks: AckRow[];
  comment_count: number;
};

const ITEM_SELECT = `
  select i.*, o.name as owner_name, a.name as assignee_name, p.name as project_name, p.color as project_color,
    coalesce((select json_agg(json_build_object('user_id', k.user_id, 'name', u.name, 'verdict', k.verdict, 'comment', k.comment) order by k.created_at)
              from acks k join users u on u.id = k.user_id where k.item_id = i.id), '[]'::json) as acks,
    (select count(*)::int from comments cm where cm.item_id = i.id) as comment_count
  from items i
  left join users o on o.id = i.owner_id
  left join users a on a.id = i.assignee_id
  left join projects p on p.id = i.project_id`;

const VISIBLE = `(i.visibility = 'team' or (i.visibility = 'private' and i.owner_id = $1))`;

export async function listItems(me: number, opts: { kind?: string; projectId?: number | null; status?: string; limit?: number } = {}) {
  const params: unknown[] = [me];
  const where = [VISIBLE];
  if (opts.kind) { params.push(opts.kind); where.push(`i.kind = $${params.length}`); }
  if (opts.projectId) { params.push(opts.projectId); where.push(`i.project_id = $${params.length}`); }
  if (opts.status) { params.push(opts.status); where.push(`i.status = $${params.length}`); }
  params.push(opts.limit ?? 300);
  return q<ItemRow>(`${ITEM_SELECT} where ${where.join(" and ")} order by i.updated_at desc limit $${params.length}`, params);
}

export async function getItem(id: number) {
  return one<ItemRow>(`${ITEM_SELECT} where i.id = $1`, [id]);
}

export async function logEvent(userId: number | null, type: string, text: string, itemId?: number | null, conversationId?: number | null) {
  await q("insert into events (user_id, type, item_id, conversation_id, text) values ($1, $2, $3, $4, $5)", [userId, type, itemId ?? null, conversationId ?? null, text]);
}

export async function getSetting(key: string, fallback: string) {
  const row = await one<{ value: string }>("select value from settings where key = $1", [key]);
  return row?.value ?? fallback;
}
export async function setSetting(key: string, value: string) {
  await q("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
}

export async function listProjects(includeArchived = false) {
  return q<{ id: number; name: string; color: string; description: string; archived: boolean }>(
    `select * from projects ${includeArchived ? "" : "where not archived"} order by created_at`,
  );
}
export async function listMembers() {
  return q<{ id: number; name: string; email: string; image: string | null; role: string; invited: boolean; last_ingest_at: string | null; created_at: string }>(
    "select id, coalesce(name, email) as name, email, image, role, invited, last_ingest_at, created_at from users order by created_at",
  );
}

/* ───────────── ingest ───────────── */

function normKey(url?: string) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.slice(0, 300);
  }
}

export type IngestResult = { id: number; items: number; updates: number; engine: string; masked: number; unchanged?: boolean; published: number; auto: boolean };

export async function ingestConversation(
  actor: Actor,
  input: { source: string; title?: string; url?: string; externalKey?: string; text: string; projectId?: number | null },
): Promise<IngestResult> {
  const { text: full, masked } = redact(input.text.slice(0, 400_000));
  const key = input.externalKey?.slice(0, 300) || normKey(input.url);

  // Re-syncing the same conversation only processes what is new since the last sync.
  let text = full;
  let previous: { id: number; raw_text: string; project_id: number | null } | null = null;
  let known: string[] = [];
  if (key) {
    previous = await one("select id, raw_text, project_id from conversations where user_id = $1 and external_key = $2 order by id desc limit 1", [actor.id, key]);
    if (previous) {
      const seen = new Set(previous.raw_text.split("\n").map((l) => l.trim()).filter(Boolean));
      const fresh = full.split("\n").filter((l) => l.trim() && !seen.has(l.trim())).join("\n");
      if (fresh.replace(/\s|【[^】]{0,8}】|-{3,}/g, "").length < 30) {
        return { id: previous.id, items: 0, updates: 0, engine: "none", masked, unchanged: true, published: 0, auto: false };
      }
      text = fresh;
      known = (await q<{ title: string }>(
        "select i.title from items i join conversations c on c.id = i.conversation_id where c.user_id = $1 and c.external_key = $2 limit 60",
        [actor.id, key],
      )).map((r) => r.title);
    }
  }

  const projects = await listProjects();
  const members = await listMembers();
  const openTasks = await q<{ id: number; title: string; subtasks: Subtask[] }>(
    `select id, title, subtasks from items where kind = 'task' and visibility <> 'draft' and status <> 'done' and (assignee_id = $1 or owner_id = $1) order by updated_at desc limit 30`,
    [actor.id],
  );

  let result: Distilled;
  let engine = "ai";
  if (aiEnabled()) {
    try {
      result = await distillWithAI(text.slice(0, 300_000), {
        author: actor.name,
        projects: projects.map((p) => ({ name: p.name, description: p.description })),
        openTasks: openTasks.map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks.map((s) => s.title) })),
        members: members.map((m) => m.name),
        known,
        today: todayISO(),
      });
    } catch (e) {
      console.error("distill failed, using heuristic", e);
      result = distillHeuristic(text, input.title);
      engine = "rules";
    }
  } else {
    result = distillHeuristic(text, input.title);
    engine = "rules";
  }
  if (known.length) {
    const k = new Set(known.map((t) => t.trim()));
    result.items = result.items.filter((i) => !k.has(i.title.trim()));
  }

  const projectId = input.projectId ?? projects.find((p) => p.name === result.project)?.id ?? previous?.project_id ?? null;
  const validTaskIds = new Set(openTasks.map((t) => t.id));

  const out = await tx(async (run) => {
    const [conv] = await run<{ id: number }>(
      `insert into conversations (user_id, source, title, url, raw_text, summary, project_id, engine, sensitive, external_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [actor.id, input.source, (input.title || result.title || "未命名对话").slice(0, 120), input.url ?? null, full, result.summary, projectId, engine, masked > 0, key],
    );
    for (const it of result.items) {
      await run(
        `insert into items (kind, title, body, details, status, visibility, owner_id, project_id, conversation_id, source, due, subtasks, due_date)
         values ($1, $2, $3, $4, 'draft', 'draft', $5, $6, $7, $8, $9, $10, $11)`,
        [
          it.kind, it.title.slice(0, 200), it.body.slice(0, 500),
          JSON.stringify({ alternatives: it.alternatives, quote: it.quote, assignee: it.assignee, sensitive: it.sensitive || /\[已打码\]/.test(it.title + it.body) }),
          actor.id, projectId, conv.id, input.source, it.due || null,
          JSON.stringify(it.subtasks.slice(0, 8).map((t) => ({ title: t, done: false }))),
          (/^\d{4}-\d{2}-\d{2}$/.test(it.due_date ?? "") ? it.due_date : null) ?? parseDue(it.due),
        ],
      );
    }
    let updates = 0;
    for (const u of result.task_updates) {
      if (!validTaskIds.has(u.task_id)) continue;
      const task = openTasks.find((t) => t.id === u.task_id)!;
      await run(
        `insert into items (kind, title, body, details, status, visibility, owner_id, project_id, conversation_id, source)
         values ('update', $1, $2, $3, 'draft', 'draft', $4, $5, $6, $7)`,
        [task.title, u.note, JSON.stringify({ task_id: u.task_id, done_subtasks: u.done_subtasks, new_status: u.status, note: u.note }), actor.id, projectId, conv.id, input.source],
      );
      updates++;
    }
    await run("update users set last_ingest_at = now() where id = $1", [actor.id]);
    return { id: conv.id, items: result.items.length, updates, engine, masked, published: 0, auto: false };
  });

  // Auto-publish: everything except sensitive items goes straight to the team; the rest waits in the inbox.
  const auto = (await one<{ auto_publish: boolean }>("select auto_publish from users where id = $1", [actor.id]))?.auto_publish;
  if (auto && out.items + out.updates > 0) {
    const drafts = await draftsOf(out.id);
    const picks = drafts.map((d) => ({ id: d.id, include: !d.details.sensitive }));
    if (picks.some((p) => p.include)) {
      const r = await publishConversation(actor, out.id, picks, projectId, { keepExcluded: true });
      return { ...out, published: r.published, auto: true };
    }
  }
  return out;
}

/* ───────────── inbox ───────────── */

export type ConversationRow = {
  id: number; user_id: number; source: string; title: string; url: string | null; summary: string; status: string;
  project_id: number | null; engine: string; sensitive: boolean; created_at: string; raw_len: number;
};

export async function inbox(me: number) {
  return q<ConversationRow>(
    `select id, user_id, source, title, url, summary, status, project_id, engine, sensitive, created_at, length(raw_text) as raw_len
     from conversations where user_id = $1 and status = 'pending' order by created_at desc`,
    [me],
  );
}

export async function draftsOf(convId: number) {
  return q<ItemRow>(`${ITEM_SELECT} where i.conversation_id = $1 and i.visibility = 'draft' order by i.kind = 'update', i.id`, [convId]);
}

export type Pick = { id: number; include: boolean; kind?: string; title?: string; body?: string };

async function findMember(name: string | undefined) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const row = await one<{ id: number }>(
    "select id from users where lower(email) = $1 or lower(name) = $1 or lower(split_part(email, '@', 1)) = $1 limit 1",
    [n],
  );
  return row?.id ?? null;
}

export async function publishConversation(actor: Actor, convId: number, picks: Pick[], projectId: number | null, opts: { keepExcluded?: boolean } = {}) {
  const conv = await one<ConversationRow & { raw_text: string }>("select * from conversations where id = $1 and user_id = $2", [convId, actor.id]);
  if (!conv) throw new Error("找不到这段对话");
  const drafts = await draftsOf(convId);
  const byId = new Map(picks.map((p) => [p.id, p]));
  const fresh: ItemRow[] = [];
  let published = 0;
  let kept = 0;

  for (const d of drafts) {
    const p = byId.get(d.id);
    if (!p?.include) {
      if (opts.keepExcluded) kept++;
      else await q("delete from items where id = $1", [d.id]);
      continue;
    }
    if (d.kind === "update") {
      await applyTaskUpdate(actor, d);
      await q("delete from items where id = $1", [d.id]);
      published++;
      continue;
    }
    const kind = (p.kind as string) || d.kind;
    const status = kind === "decision" ? "discussing" : kind === "task" ? "todo" : "open";
    const assignee = kind === "task" ? (await findMember(d.details.assignee)) ?? actor.id : null;
    await q(
      `update items set kind = $2, title = $3, body = $4, status = $5, visibility = 'team', project_id = $6, assignee_id = $7, updated_at = now() where id = $1`,
      [d.id, kind, (p.title ?? d.title).slice(0, 200), (p.body ?? d.body).slice(0, 500), status, projectId, assignee],
    );
    if (kind === "decision") await q("insert into acks (item_id, user_id, verdict) values ($1, $2, 'agree') on conflict do nothing", [d.id, actor.id]);
    fresh.push({ ...d, kind, title: p.title ?? d.title, body: p.body ?? d.body });
    published++;
  }

  await q("update conversations set status = $3, project_id = $2 where id = $1", [convId, projectId, kept ? "pending" : "published"]);
  if (published) await logEvent(actor.id, "publish", conv.summary || conv.title, null, convId);

  // Conflict & duplicate detection against the existing team record.
  const candidates = fresh.filter((f) => f.kind === "decision" || f.kind === "task");
  if (candidates.length) {
    const existing = await q<{ id: number; kind: string; title: string; body: string; owner: string }>(
      `select i.id, i.kind, i.title, i.body, coalesce(u.name, '') as owner from items i left join users u on u.id = i.owner_id
       where i.visibility = 'team' and ((i.kind = 'decision' and i.status in ('discussing', 'confirmed')) or (i.kind = 'task' and i.status <> 'done'))
         and not (i.id = any($1::int[])) order by i.updated_at desc limit 80`,
      [candidates.map((c) => c.id)],
    );
    const rels = await findRelations(
      candidates.map((c) => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, owner: actor.name })),
      existing,
    );
    const known = new Set(existing.map((e) => e.id));
    for (const r of rels) {
      if (!known.has(r.existing_id) || !candidates.some((c) => c.id === r.new_id)) continue;
      if (r.type === "conflict") {
        await q("update items set status = 'conflict', conflict_with = $2, details = details || $3::jsonb where id = $1 and kind = 'decision'", [r.new_id, r.existing_id, JSON.stringify({ reason: r.reason })]);
        await logEvent(actor.id, "conflict", `${code("decision", r.new_id)} 与 ${code("decision", r.existing_id)} 冲突：${r.reason}`, r.new_id);
      } else {
        await q("update items set duplicate_of = $2, details = details || $3::jsonb where id = $1", [r.new_id, r.existing_id, JSON.stringify({ reason: r.reason })]);
      }
    }
  }
  for (const c of candidates.filter((c) => c.kind === "decision")) await checkConfirm(c.id, actor);

  // One compact message per publish, so channels stay quiet.
  const decided = await q<{ id: number; title: string; status: string; conflict_with: number | null; reason: string | null }>(
    "select id, title, status, conflict_with, details->>'reason' as reason from items where id = any($1::int[]) and kind = 'decision'",
    [candidates.map((c) => c.id)],
  );
  const conflicts = decided.filter((d) => d.status === "conflict");
  const pendingAck = decided.filter((d) => d.status === "discussing");
  const lines = [
    ...conflicts.map((d) => `⚠️ ${code("decision", d.id)} ${d.title} —— 与 ${code("decision", d.conflict_with ?? 0)} 冲突${d.reason ? `：${d.reason}` : ""}`),
    ...pendingAck.map((d) => `• ${code("decision", d.id)} ${d.title}`),
  ];
  if (lines.length) {
    const first = conflicts[0] ?? pendingAck[0];
    await notify(
      conflicts.length ? `${actor.name} 的新决策和已有共识冲突，需要大家看一下` : `${actor.name} 提出了 ${pendingAck.length} 条决策，等待确认`,
      lines,
      `/item/${first.id}`,
    );
  }
  return { published, kept };
}

async function applyTaskUpdate(actor: Actor, d: ItemRow) {
  const taskId = d.details.task_id;
  if (!taskId) return;
  const task = await one<{ id: number; subtasks: Subtask[]; status: string }>("select id, subtasks, status from items where id = $1 and kind = 'task'", [taskId]);
  if (!task) return;
  const done = new Set((d.details.done_subtasks ?? []).map((s) => s.trim()));
  const subtasks = task.subtasks.map((s) => (done.has(s.title.trim()) ? { ...s, done: true } : s));
  let status = d.details.new_status || task.status;
  if (status === "todo" || (!d.details.new_status && task.status === "todo")) status = "doing";
  if (subtasks.length && subtasks.every((s) => s.done)) status = "done";
  const note = d.details.note || d.body || "有新进展";
  await q(
    "update items set subtasks = $2, status = $3, last_update = $4, last_update_at = now(), updated_at = now(), last_update_source = $5, completed_at = case when $3 = 'done' then coalesce(completed_at, now()) else null end where id = $1",
    [taskId, JSON.stringify(subtasks), status, note, d.source],
  );
  await logEvent(actor.id, "task_progress", note, taskId);
}

export async function keepPrivate(actor: Actor, convId: number) {
  await q("update items set visibility = 'private', status = case kind when 'decision' then 'discussing' when 'task' then 'todo' else 'open' end where conversation_id = $1 and visibility = 'draft' and kind <> 'update' and owner_id = $2", [convId, actor.id]);
  await q("delete from items where conversation_id = $1 and visibility = 'draft'", [convId]);
  await q("update conversations set status = 'private' where id = $1 and user_id = $2", [convId, actor.id]);
}

export async function discardConversation(actor: Actor, convId: number) {
  await q("delete from items where conversation_id = $1 and visibility = 'draft' and owner_id = $2", [convId, actor.id]);
  await q("delete from conversations where id = $1 and user_id = $2", [convId, actor.id]);
}

/* ───────────── consensus ───────────── */

export async function ackThreshold() {
  const t = Number(await getSetting("ack_threshold", "2")) || 2;
  const n = (await one<{ c: number }>("select count(*)::int as c from users where not invited"))?.c ?? 1;
  return Math.max(1, Math.min(t, n));
}

export async function checkConfirm(itemId: number, actor: Actor) {
  const item = await getItem(itemId);
  if (!item || item.kind !== "decision" || item.status !== "discussing") return;
  const agrees = item.acks.filter((a) => a.verdict === "agree").length;
  const objections = item.acks.some((a) => a.verdict === "object");
  if (!objections && agrees >= (await ackThreshold())) await confirmDecision(itemId, actor);
}

export async function confirmDecision(itemId: number, actor: Actor) {
  await q("update items set status = 'confirmed', conflict_with = null, updated_at = now() where id = $1", [itemId]);
  const unblocked = await q<{ id: number }>(
    "update items set status = 'doing', blocked_by = null, last_update = $2, last_update_at = now(), last_update_source = 'manual', updated_at = now() where blocked_by = $1 and status = 'blocked' returning id",
    [itemId, `依赖的 ${code("decision", itemId)} 已达成共识`],
  );
  const item = await getItem(itemId);
  await logEvent(actor.id, "confirm", `${item?.title ?? ""} 已达成共识${unblocked.length ? `，解除了 ${unblocked.length} 个任务的阻塞` : ""}`, itemId);
  if (item && (item.acks.length > 1 || unblocked.length)) {
    await notify(`✅ 达成共识：${code("decision", itemId)} ${item.title}`, [
      `确认：${item.acks.filter((a) => a.verdict === "agree").map((a) => a.name).join("、")}`,
      ...(unblocked.length ? [`解除了 ${unblocked.length} 个任务的阻塞`] : []),
    ], `/item/${itemId}`);
  }
}

export async function ack(actor: Actor, itemId: number, verdict: "agree" | "object", comment?: string) {
  await q(
    `insert into acks (item_id, user_id, verdict, comment) values ($1, $2, $3, $4)
     on conflict (item_id, user_id) do update set verdict = excluded.verdict, comment = excluded.comment, created_at = now()`,
    [itemId, actor.id, verdict, comment ?? null],
  );
  const item = await getItem(itemId);
  await logEvent(actor.id, verdict === "agree" ? "ack" : "object", verdict === "agree" ? `同意「${item?.title}」` : `对「${item?.title}」提出异议${comment ? `：${comment}` : ""}`, itemId);
  if (verdict === "agree") await checkConfirm(itemId, actor);
}

export async function resolveConflict(actor: Actor, itemId: number, keep: "this" | "other") {
  const item = await getItem(itemId);
  if (!item?.conflict_with) return;
  const other = item.conflict_with;
  if (keep === "this") {
    await q("update items set status = 'superseded', superseded_by = $2, updated_at = now() where id = $1", [other, itemId]);
    await confirmDecision(itemId, actor);
  } else {
    await q("update items set status = 'superseded', superseded_by = $2, conflict_with = null, updated_at = now() where id = $1", [itemId, other]);
    await logEvent(actor.id, "resolve", `冲突已解决：保留 ${code("decision", other)}`, itemId);
  }
}

/* ───────────── tasks & items ───────────── */

export type NewItem = {
  kind: string; title: string; body?: string; projectId?: number | null; assigneeId?: number | null; due?: string; dueDate?: string | null;
  subtasks?: string[]; blockedBy?: number | null; source?: string; goalId?: number | null; visibility?: "team" | "private";
};

export async function createItem(actor: Actor, input: NewItem) {
  const status = input.kind === "decision" ? "discussing" : input.kind === "task" ? (input.blockedBy ? "blocked" : "todo") : "open";
  const visibility = input.visibility ?? (input.kind === "idea" ? "private" : "team");
  const dueDate = input.dueDate || parseDue(input.due) || (input.kind === "task" ? parseDue(input.title) : null);
  const assigneeId = input.kind === "task" ? input.assigneeId ?? actor.id : null;
  const row = await one<{ id: number }>(
    `insert into items (kind, title, body, status, visibility, owner_id, assignee_id, project_id, source, due, subtasks, blocked_by, due_date, goal_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [
      input.kind, input.title.slice(0, 200), (input.body ?? "").slice(0, 2000), status, visibility, actor.id,
      assigneeId, input.projectId ?? null, input.source ?? "manual",
      input.due || null, JSON.stringify((input.subtasks ?? []).filter(Boolean).map((t) => ({ title: t, done: false }))), input.blockedBy ?? null,
      dueDate, input.goalId ?? null,
    ],
  );
  const id = row!.id;
  if (input.kind === "decision") {
    await q("insert into acks (item_id, user_id, verdict) values ($1, $2, 'agree')", [id, actor.id]);
    await checkConfirm(id, actor);
  }
  if (visibility === "team") await logEvent(actor.id, "create", input.title, id);
  if (input.kind === "task" && assigneeId && assigneeId !== actor.id) {
    await dmUser(assigneeId, `${actor.name} 给你分配了任务`, [`${code("task", id)} ${input.title}${dueDate ? ` · 截止 ${fmtDay(dueDate)}` : ""}`], `/item/${id}`);
  }
  return id;
}

export async function moveTask(actor: Actor, taskId: number, status: string) {
  if (!(status in TASK_STATUS)) throw new Error("无效状态");
  const task = await one<{ subtasks: Subtask[] }>("select subtasks from items where id = $1 and kind = 'task'", [taskId]);
  if (!task) throw new Error("找不到任务");
  const subtasks = status === "done" ? task.subtasks.map((s) => ({ ...s, done: true })) : task.subtasks;
  await q(
    `update items set status = $2, subtasks = $3, last_update = $4, last_update_at = now(), updated_at = now(), last_update_source = 'manual',
       completed_at = case when $2 = 'done' then coalesce(completed_at, now()) else null end,
       blocked_by = case when $2 = 'blocked' then blocked_by else null end where id = $1`,
    [taskId, status, JSON.stringify(subtasks), `${actor.name} 移到「${TASK_STATUS[status]}」`],
  );
  await logEvent(actor.id, "task_move", `${code("task", taskId)} → ${TASK_STATUS[status]}`, taskId);
}

export async function setSubtasks(actor: Actor, taskId: number, subtasks: Subtask[]) {
  const row = await one<{ status: string }>("select status from items where id = $1 and kind = 'task'", [taskId]);
  if (!row) throw new Error("找不到任务");
  let status = row.status;
  if (subtasks.length && subtasks.every((s) => s.done)) status = "done";
  else if (status === "todo" && subtasks.some((s) => s.done)) status = "doing";
  else if (status === "done" && subtasks.some((s) => !s.done)) status = "doing";
  await q("update items set subtasks = $2, status = $3, updated_at = now(), last_update = $4, last_update_at = now(), last_update_source = 'manual', completed_at = case when $3 = 'done' then coalesce(completed_at, now()) else null end where id = $1", [
    taskId, JSON.stringify(subtasks.slice(0, 20)), status, `${actor.name} 更新了子任务`,
  ]);
}

export async function deleteItem(actor: Actor, itemId: number) {
  const item = await one<{ owner_id: number }>("select owner_id from items where id = $1", [itemId]);
  if (!item) return;
  if (item.owner_id !== actor.id && actor.role !== "admin") throw new Error("只有创建者或管理员可以删除");
  await q("delete from items where id = $1", [itemId]);
}

export type ItemPatch = { title?: string; body?: string; dueDate?: string | null; assigneeId?: number | null; projectId?: number | null; goalId?: number | null };

export async function editItem(actor: Actor, itemId: number, patch: ItemPatch) {
  const item = await one<{ owner_id: number; kind: string; title: string; assignee_id: number | null }>("select owner_id, kind, title, assignee_id from items where id = $1", [itemId]);
  if (!item) throw new Error("找不到条目");
  const has = (k: keyof ItemPatch) => patch[k] !== undefined;
  const dueDate = patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ? parseDue(patch.dueDate) : patch.dueDate ?? null;
  await q(
    `update items set title = coalesce($2, title), body = coalesce($3, body),
       due_date = case when $4::boolean then $5::date else due_date end,
       assignee_id = case when $6::boolean then $7 else assignee_id end,
       project_id = case when $8::boolean then $9 else project_id end,
       goal_id = case when $10::boolean then $11 else goal_id end, updated_at = now() where id = $1`,
    [itemId, patch.title ?? null, patch.body ?? null, has("dueDate"), dueDate, has("assigneeId"), patch.assigneeId ?? null, has("projectId"), patch.projectId ?? null, has("goalId"), patch.goalId ?? null],
  );
  if (has("assigneeId") && patch.assigneeId && patch.assigneeId !== actor.id && patch.assigneeId !== item.assignee_id && item.kind === "task") {
    await dmUser(patch.assigneeId, `${actor.name} 把任务交给了你`, [`${code("task", itemId)} ${item.title}`], `/item/${itemId}`);
  }
}

/* ───────────── ideas ───────────── */

export async function shareIdea(actor: Actor, id: number) {
  const it = await one<{ owner_id: number; title: string }>("select owner_id, title from items where id = $1 and kind = 'idea'", [id]);
  if (!it || it.owner_id !== actor.id) throw new Error("只能分享自己的想法");
  await q("update items set visibility = 'team', updated_at = now() where id = $1", [id]);
  await logEvent(actor.id, "create", it.title, id);
}

export async function convertIdea(actor: Actor, id: number, kind: "decision" | "task" | "question") {
  const it = await one<{ owner_id: number; title: string; body: string; project_id: number | null }>("select owner_id, title, body, project_id from items where id = $1 and kind = 'idea'", [id]);
  if (!it || it.owner_id !== actor.id) throw new Error("只能转换自己的想法");
  const newId = await createItem(actor, { kind, title: it.title, body: it.body, projectId: it.project_id });
  await q("update items set status = 'resolved', details = details || $2::jsonb, updated_at = now() where id = $1", [id, JSON.stringify({ converted_to: newId })]);
  return newId;
}

/* ───────────── weekly goals ───────────── */

export type GoalRow = {
  id: number; title: string; scope: "team" | "personal"; owner_id: number | null; owner_name: string | null; project_id: number | null;
  project_name: string | null; project_color: string | null; week: string; status: string; manual_progress: number | null; note: string;
  tasks_total: number; tasks_done: number; subtasks_total: number; subtasks_done: number;
};

export async function listGoals(me: number, week: string) {
  return q<GoalRow>(
    `select g.*, u.name as owner_name, p.name as project_name, p.color as project_color,
       count(i.id)::int as tasks_total, count(i.id) filter (where i.status = 'done')::int as tasks_done,
       coalesce(sum(greatest(jsonb_array_length(i.subtasks), 1)) filter (where i.id is not null), 0)::int as subtasks_total,
       coalesce(sum(case when jsonb_array_length(i.subtasks) = 0 then (i.status = 'done')::int
                         else (select count(*) from jsonb_array_elements(i.subtasks) s where (s->>'done')::boolean) end), 0)::int as subtasks_done
     from goals g left join users u on u.id = g.owner_id left join projects p on p.id = g.project_id
     left join items i on i.goal_id = g.id and i.kind = 'task' and i.visibility <> 'draft'
     where g.week = $2 and (g.scope = 'team' or g.owner_id = $1)
     group by g.id, u.name, p.name, p.color order by g.scope, g.created_at`,
    [me, week],
  );
}

export function goalPct(g: GoalRow) {
  if (g.status === "done") return 100;
  if (g.manual_progress != null && !g.subtasks_total) return g.manual_progress;
  return g.subtasks_total ? Math.round((g.subtasks_done / g.subtasks_total) * 100) : g.manual_progress ?? 0;
}

export async function saveGoal(actor: Actor, input: { id?: number; title: string; scope: "team" | "personal"; projectId?: number | null; week?: string; note?: string; status?: string; manualProgress?: number | null }) {
  const week = weekStart(input.week ?? todayISO());
  if (input.id) {
    await q(
      `update goals set title = $2, project_id = $3, note = $4, status = coalesce($5, status), manual_progress = $6, updated_at = now() where id = $1 and (scope = 'team' or owner_id = $7)`,
      [input.id, input.title.slice(0, 200), input.projectId ?? null, input.note ?? "", input.status ?? null, input.manualProgress ?? null, actor.id],
    );
    return input.id;
  }
  const row = await one<{ id: number }>(
    "insert into goals (title, scope, owner_id, project_id, week, note) values ($1, $2, $3, $4, $5, $6) returning id",
    [input.title.slice(0, 200), input.scope, actor.id, input.projectId ?? null, week, input.note ?? ""],
  );
  if (input.scope === "team") await logEvent(actor.id, "goal", `新增本周目标：${input.title}`);
  return row!.id;
}

export async function carryOverGoals(actor: Actor, fromWeek: string, toWeek: string) {
  const rows = await q<{ id: number }>(
    `insert into goals (title, scope, owner_id, project_id, week, note)
     select title, scope, $3, project_id, $2, note from goals g
     where g.week = $1 and g.status not in ('done') and (g.scope = 'team' or g.owner_id = $3)
       and not exists (select 1 from goals x where x.week = $2 and x.title = g.title and x.scope = g.scope)
     returning id`,
    [fromWeek, toWeek, actor.id],
  );
  return rows.length;
}

/* ───────────── search & context ───────────── */

function grams(s: string) {
  const t = s.toLowerCase().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (const w of t.split(/[^\p{L}\p{N}]+/u)) if (w.length > 1 && /^[a-z0-9]+$/.test(w)) out.add(w);
  const cjk = t.replace(/[^\p{Script=Han}]/gu, "");
  for (let i = 0; i < cjk.length - 1; i++) out.add(cjk.slice(i, i + 2));
  return out;
}

export async function search(me: number, query: string, limit = 12) {
  const items = await listItems(me, { limit: 500 });
  const qg = grams(query);
  const needle = query.trim().toLowerCase();
  const m = needle.match(/^([dtiq])-?(\d+)$/i);
  if (m) return items.filter((i) => i.id === Number(m[2])).slice(0, 1);
  return items
    .filter((i) => i.status !== "draft")
    .map((i) => {
      const hay = `${i.title} ${i.body} ${i.project_name ?? ""} ${i.owner_name ?? ""} ${i.assignee_name ?? ""}`;
      const g = grams(hay);
      let score = 0;
      for (const x of qg) if (g.has(x)) score++;
      if (needle && hay.toLowerCase().includes(needle)) score += 5;
      if (i.status === "superseded") score -= 0.5;
      return { i, score };
    })
    .filter((x) => x.score > 0 || !needle)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.i);
}

export function itemLine(i: ItemRow, today = todayISO()) {
  const who = i.kind === "task" ? i.assignee_name ?? i.owner_name : i.owner_name;
  const st = i.kind === "task" ? TASK_STATUS[i.status] : DECISION_STATUS[i.status] ?? (i.status === "resolved" ? "已解决" : "开放");
  const prog = i.kind === "task" && i.subtasks.length ? ` ${i.subtasks.filter((s) => s.done).length}/${i.subtasks.length}` : "";
  const due = i.due_date ? ` · DDL ${i.due_date}（${fmtDue(i.due_date, today)}）` : i.due ? ` · 截止 ${i.due}` : "";
  return `[${code(i.kind, i.id)}] (${st}${prog}) ${i.title}${i.body ? ` —— ${i.body.slice(0, 160)}` : ""}${who ? ` · ${who}` : ""}${i.project_name ? ` · ${i.project_name}` : ""}${due}${i.last_update ? ` · 最新：${i.last_update}` : ""}`;
}

/* ───────────── context engine: what every AI reads ───────────── */

export type ContextScope = "team" | "project" | "me";
export type ContextOptions = { projectId?: number | null; topic?: string; scope?: ContextScope; budget?: number };
export type BuiltContext = { text: string; tokens: number; asOf: string; sections: { name: string; shown: number; total: number }[] };

/**
 * Assembles the team memory into one prompt-ready document, most important first, within a token budget.
 * Layers: team profile → project brief → this week's goals → items relevant to the topic → confirmed consensus →
 * open decisions → active tasks by DDL → open questions → recent insights → rules for the AI.
 */
export async function buildContext(me: number, opts: ContextOptions = {}): Promise<BuiltContext> {
  const budget = opts.budget ?? 6000;
  const today = todayISO();
  const projectId = opts.projectId ?? null;
  const [ws, brief, items, goals, project, meRow] = await Promise.all([
    getSetting("workspace_name", "SimReal"),
    getSetting("team_brief", ""),
    listItems(me, { projectId: projectId ?? undefined, limit: 500 }),
    listGoals(me, weekStart(today)),
    projectId ? one<{ name: string; description: string; context: string }>("select name, description, context from projects where id = $1", [projectId]) : Promise.resolve(null),
    one<{ name: string }>("select coalesce(name, email) as name from users where id = $1", [me]),
  ]);
  const visible = items.filter((i) => i.kind !== "idea" || (opts.scope === "me" && i.owner_id === me));
  const mine = (i: ItemRow) => i.assignee_id === me || i.owner_id === me;
  const pick = opts.scope === "me" ? visible.filter(mine) : visible;

  const out: string[] = [];
  const sections: BuiltContext["sections"] = [];
  let used = 0;
  const push = (text: string) => { out.push(text); used += estimateTokens(text); };
  const section = (name: string, lines: string[], reserve = 400) => {
    if (!lines.length) return;
    const shown: string[] = [];
    for (const l of lines) {
      if (used + estimateTokens(l) > budget - reserve && shown.length) break;
      shown.push(l);
      used += estimateTokens(l);
    }
    out.push(`\n## ${name}\n${shown.join("\n")}${shown.length < lines.length ? `\n- …另有 ${lines.length - shown.length} 条（用 search_team_memory 查询）` : ""}`);
    sections.push({ name, shown: shown.length, total: lines.length });
  };

  const scopeLabel = project ? ` · 项目「${project.name}」` : opts.scope === "me" ? ` · ${meRow?.name ?? ""} 的工作` : "";
  push(`# ${ws} 团队上下文${scopeLabel}\n更新于 ${today}（${fmtDay(today).split(" ")[1]}）。条目编号可直接引用，例如 [D-12]。`);
  if (brief.trim()) section("团队档案", [brief.trim().slice(0, 2400)], 1500);
  if (project) section("项目背景", [(project.context || project.description || "").trim()].filter(Boolean), 1500);

  const pct = (g: GoalRow) => `${goalPct(g)}%`;
  section("本周目标", goals.filter((g) => opts.scope !== "me" || g.scope === "team" || g.owner_id === me)
    .map((g) => `- ${g.scope === "personal" ? `[个人·${g.owner_name}] ` : ""}${g.title}（${pct(g)}${g.status === "at_risk" ? "，有风险" : g.status === "done" ? "，已完成" : ""}）`));

  if (opts.topic?.trim()) {
    const hits = (await search(me, opts.topic, 12)).filter((i) => i.kind !== "idea");
    section(`与「${opts.topic.trim().slice(0, 30)}」相关`, hits.map((i) => `- ${itemLine(i, today)}`));
  }

  section("已确认的共识（必须遵循）", pick.filter((i) => i.kind === "decision" && i.status === "confirmed").map((i) => `- ${itemLine(i, today)}`));
  section("讨论中 / 有冲突的决策（尚未定论）", pick.filter((i) => i.kind === "decision" && (i.status === "discussing" || i.status === "conflict")).map((i) => `- ${itemLine(i, today)}`));
  const byDue = (a: ItemRow, b: ItemRow) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : (a.due_date ?? "9999") > (b.due_date ?? "9999") ? 1 : 0;
  section("进行中的任务（按 DDL 排序）", pick.filter((i) => i.kind === "task" && i.status !== "done").sort(byDue).map((i) => `- ${itemLine(i, today)}`));
  section("待定问题", pick.filter((i) => i.kind === "question" && i.status === "open").map((i) => `- ${itemLine(i, today)}`));
  const since = addDays(today, -21);
  section("近期洞察", pick.filter((i) => i.kind === "insight" && i.created_at.slice(0, 10) >= since).map((i) => `- ${itemLine(i, today)}`));
  if (opts.scope === "me") section("我的想法（仅自己可见）", pick.filter((i) => i.kind === "idea" && i.status === "open").map((i) => `- ${itemLine(i, today)}`));

  out.push(`\n## 给 AI 的规则
- 回答前先对照「已确认的共识」；如果你的建议与某条共识冲突，明确指出编号并说明理由，不要默默推翻。
- 「讨论中」的决策还没定论，可以给意见，但不要当作既定事实。
- 对话中出现新的决策、任务或 DDL 时，在回答末尾用一行列出，方便同步回团队。`);
  const text = out.join("\n");
  return { text, tokens: estimateTokens(text), asOf: today, sections };
}

export async function contextPack(me: number, projectId?: number | null, topic?: string) {
  return (await buildContext(me, { projectId, topic })).text;
}

/* ───────────── discussion ───────────── */

export type CommentRow = { id: number; item_id: number; user_id: number | null; name: string | null; image: string | null; body: string; created_at: string };

export async function listComments(itemId: number) {
  return q<CommentRow>(
    "select c.id, c.item_id, c.user_id, u.name, u.image, c.body, c.created_at from comments c left join users u on u.id = c.user_id where c.item_id = $1 order by c.created_at",
    [itemId],
  );
}

export async function addComment(actor: Actor, itemId: number, body: string) {
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error("评论不能为空");
  const item = await getItem(itemId);
  if (!item) throw new Error("找不到条目");
  await q("insert into comments (item_id, user_id, body) values ($1, $2, $3)", [itemId, actor.id, text]);
  await q("update items set updated_at = now() where id = $1", [itemId]);
  await logEvent(actor.id, "comment", text, itemId);
}

/* ───────────── "since your last visit" ───────────── */

/** Returns the start of the user's previous session and records this visit. */
export async function sinceLastVisit(userId: number): Promise<string> {
  const row = await one<{ seen_at: string | null; prev_seen_at: string | null }>("select seen_at, prev_seen_at from users where id = $1", [userId]);
  const now = Date.now();
  if (!row?.seen_at) {
    await q("update users set seen_at = now(), prev_seen_at = now() - interval '1 day' where id = $1", [userId]);
    return new Date(now - 864e5).toISOString();
  }
  if (now - new Date(row.seen_at).getTime() > 30 * 60_000) {
    await q("update users set prev_seen_at = seen_at, seen_at = now() where id = $1", [userId]);
    return row.seen_at;
  }
  await q("update users set seen_at = now() where id = $1", [userId]);
  return row.prev_seen_at ?? new Date(now - 864e5).toISOString();
}
