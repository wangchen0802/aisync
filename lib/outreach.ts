import "server-only";
import { one, q } from "@/lib/db";
import { getSetting, type Actor } from "@/lib/core";
import { addDays, todayISO } from "@/lib/meta";
import { isActive, isLost, isWon, nextStage, parseMoney, pipelineOf, stageLabel, stagesOf, STALE_DAYS, type Pipeline } from "@/lib/outreach-meta";

export type Contact = {
  id: number; pipeline: Pipeline; name: string; org: string; title: string; email: string; handle: string; link: string;
  stage: string; heat: string; owner_id: number | null; owner_name: string | null; round_id: number | null; amount: number | null;
  source: string; intro_by: string; next_step: string; next_date: string | null; last_touch_at: string | null; notes: string;
  created_at: string; updated_at: string; touches: number;
};
export type Round = {
  id: number; name: string; target: number; currency: string; instrument: string; valuation: string; close_date: string | null; status: string;
};
export type Touch = { id: number; contact_id: number; user_id: number | null; user_name: string | null; kind: string; body: string; created_at: string };

const SELECT = `select c.*, u.name as owner_name, (select count(*)::int from touches t where t.contact_id = c.id and t.kind <> 'stage') as touches
  from contacts c left join users u on u.id = c.owner_id`;

/* ───────────── access ───────────── */

/** Investor pipeline can be limited to admins (setting outreach_investor_access = "admins"). */
export async function investorAccess(): Promise<"all" | "admins"> {
  return (await getSetting("outreach_investor_access", "all")) === "admins" ? "admins" : "all";
}
export async function canSee(me: Actor, pipeline: string) {
  if (pipeline !== "investor") return true;
  return me.role === "admin" || (await investorAccess()) === "all";
}
export async function visiblePipelines(me: Actor): Promise<Pipeline[]> {
  const all: Pipeline[] = ["investor", "customer", "partner", "talent"];
  return (await canSee(me, "investor")) ? all : all.slice(1);
}
async function guard(me: Actor, id: number) {
  const c = await one<{ pipeline: string }>("select pipeline from contacts where id = $1", [id]);
  if (!c || !(await canSee(me, c.pipeline))) throw new Error("找不到联系人");
  return c.pipeline;
}

/* ───────────── queries ───────────── */

export async function listContacts(pipeline: Pipeline) {
  return q<Contact>(`${SELECT} where c.pipeline = $1 order by c.updated_at desc limit 2000`, [pipeline]);
}
export async function getContact(me: Actor, id: number) {
  const c = await one<Contact>(`${SELECT} where c.id = $1`, [id]);
  if (!c || !(await canSee(me, c.pipeline))) return null;
  return c;
}
export async function listTouches(contactId: number, limit = 100) {
  return q<Touch>(
    `select t.*, u.name as user_name from touches t left join users u on u.id = t.user_id where t.contact_id = $1 order by t.created_at desc limit $2`,
    [contactId, limit],
  );
}
export async function recentTouches(pipeline: Pipeline, limit = 8) {
  return q<Touch & { org: string; name: string }>(
    `select t.*, u.name as user_name, c.org, c.name from touches t join contacts c on c.id = t.contact_id left join users u on u.id = t.user_id
     where c.pipeline = $1 order by t.created_at desc limit $2`,
    [pipeline, limit],
  );
}
export async function pipelineCounts(pipelines: Pipeline[]) {
  const rows = await q<{ pipeline: string; n: number }>("select pipeline, count(*)::int as n from contacts where pipeline = any($1) group by pipeline", [pipelines]);
  return Object.fromEntries(rows.map((r) => [r.pipeline, r.n])) as Record<string, number>;
}

export async function listRounds() {
  return q<Round>("select * from rounds order by status = 'active' desc, created_at desc");
}
export async function activeRound() {
  return one<Round>("select * from rounds where status = 'active' order by created_at desc limit 1");
}

/** Contacts that need a nudge: follow-up date due, or active and silent for STALE_DAYS. */
export function followUps(contacts: Contact[], today = todayISO(), horizon = 2) {
  const cutoff = Date.now() - STALE_DAYS * 86400_000;
  const out: { c: Contact; why: "due" | "stale" }[] = [];
  for (const c of contacts) {
    if (isLost(c.pipeline, c.stage) || c.stage === "closed" || (c.pipeline !== "investor" && isWon(c.pipeline, c.stage))) continue;
    if (c.next_date && c.next_date <= addDays(today, horizon)) out.push({ c, why: "due" });
    else if (!c.next_date && isActive(c.pipeline, c.stage) && new Date(c.last_touch_at ?? c.created_at).getTime() < cutoff) out.push({ c, why: "stale" });
  }
  return out.sort((a, b) => (a.why !== b.why ? (a.why === "due" ? -1 : 1) : (a.c.next_date ?? a.c.last_touch_at ?? "") < (b.c.next_date ?? b.c.last_touch_at ?? "") ? -1 : 1));
}

export function isStale(c: Contact) {
  return !c.next_date && isActive(c.pipeline, c.stage) && new Date(c.last_touch_at ?? c.created_at).getTime() < Date.now() - STALE_DAYS * 86400_000;
}

export function roundStats(contacts: Contact[], round: Round | null) {
  const inRound = contacts.filter((c) => c.pipeline === "investor" && (!round || c.round_id === round.id || c.round_id == null));
  const sum = (xs: Contact[]) => xs.reduce((s, c) => s + (c.amount ?? 0), 0);
  const stages = stagesOf("investor");
  const closed = sum(inRound.filter((c) => c.stage === "closed"));
  const committed = sum(inRound.filter((c) => c.stage === "committed"));
  const termSheet = sum(inRound.filter((c) => c.stage === "term_sheet"));
  const weighted = inRound.reduce((s, c) => s + (c.amount ?? 0) * (stages.find((x) => x.key === c.stage)?.p ?? 0), 0);
  const reached = inRound.filter((c) => c.stage !== "target").length;
  const met = inRound.filter((c) => ["meeting", "diligence", "term_sheet", "committed", "closed"].includes(c.stage)).length;
  return { closed, committed, termSheet, weighted, reached, met, total: inRound.length, target: round?.target ?? 0 };
}

/* ───────────── mutations ───────────── */

export type ContactInput = {
  id?: number; pipeline: Pipeline; name: string; org: string; title?: string; email?: string; handle?: string; link?: string;
  stage?: string; heat?: string; ownerId?: number | null; roundId?: number | null; amount?: string | number | null;
  source?: string; introBy?: string; nextStep?: string; nextDate?: string | null; notes?: string;
};

function clean(input: ContactInput) {
  const p = pipelineOf(input.pipeline).key;
  const stages = stagesOf(p).map((s) => s.key);
  const amount = typeof input.amount === "number" ? input.amount : parseMoney(input.amount ?? "");
  return {
    pipeline: p,
    name: (input.name ?? "").trim().slice(0, 120),
    org: (input.org ?? "").trim().slice(0, 160),
    title: (input.title ?? "").trim().slice(0, 120),
    email: (input.email ?? "").trim().slice(0, 200),
    handle: (input.handle ?? "").trim().slice(0, 200),
    link: (input.link ?? "").trim().slice(0, 400),
    stage: input.stage && stages.includes(input.stage) ? input.stage : "target",
    heat: ["hot", "warm", "cold"].includes(input.heat ?? "") ? input.heat! : "warm",
    amount,
    source: (input.source ?? "").slice(0, 40),
    introBy: (input.introBy ?? "").trim().slice(0, 120),
    nextStep: (input.nextStep ?? "").trim().slice(0, 300),
    nextDate: input.nextDate && /^\d{4}-\d{2}-\d{2}$/.test(input.nextDate) ? input.nextDate : null,
    notes: (input.notes ?? "").slice(0, 5000),
  };
}

export async function saveContact(me: Actor, input: ContactInput) {
  const c = clean(input);
  if (!c.name && !c.org) throw new Error("至少填联系人或机构");
  if (!(await canSee(me, c.pipeline))) throw new Error("没有权限");
  if (input.id) {
    const before = await one<{ stage: string; pipeline: string }>("select stage, pipeline from contacts where id = $1", [input.id]);
    if (!before || !(await canSee(me, before.pipeline))) throw new Error("找不到联系人");
    await q(
      `update contacts set name = $2, org = $3, title = $4, email = $5, handle = $6, link = $7, heat = $8, owner_id = $9, round_id = $10, amount = $11,
         source = $12, intro_by = $13, next_step = $14, next_date = $15, notes = $16, stage = $17, updated_at = now() where id = $1`,
      [input.id, c.name, c.org, c.title, c.email, c.handle, c.link, c.heat, input.ownerId ?? null, input.roundId ?? null, c.amount,
        c.source, c.introBy, c.nextStep, c.nextDate, c.notes, c.stage],
    );
    if (before.stage !== c.stage) await stageTouch(me, input.id, before.pipeline, before.stage, c.stage);
    return input.id;
  }
  const round = c.pipeline === "investor" ? input.roundId ?? (await activeRound())?.id ?? null : null;
  const row = await one<{ id: number }>(
    `insert into contacts (pipeline, name, org, title, email, handle, link, stage, heat, owner_id, round_id, amount, source, intro_by, next_step, next_date, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id`,
    [c.pipeline, c.name, c.org, c.title, c.email, c.handle, c.link, c.stage, c.heat, input.ownerId === undefined ? me.id : input.ownerId, round, c.amount,
      c.source, c.introBy, c.nextStep, c.nextDate, c.notes],
  );
  return row!.id;
}

async function stageTouch(me: Actor, id: number, pipeline: string, from: string, to: string) {
  await q("insert into touches (contact_id, user_id, kind, body) values ($1, $2, 'stage', $3)", [id, me.id, `${stageLabel(pipeline, from)} → ${stageLabel(pipeline, to)}`]);
  if (from === "target" || !isLost(pipeline, to)) await q("update contacts set last_touch_at = now() where id = $1", [id]);
}

export async function moveContact(me: Actor, id: number, stage: string) {
  const pipeline = await guard(me, id);
  if (!stagesOf(pipeline).some((s) => s.key === stage)) throw new Error("无效阶段");
  const before = await one<{ stage: string }>("select stage from contacts where id = $1", [id]);
  if (!before || before.stage === stage) return;
  await q("update contacts set stage = $2, updated_at = now() where id = $1", [id, stage]);
  await stageTouch(me, id, pipeline, before.stage, stage);
}

export async function advanceContact(me: Actor, id: number) {
  const c = await one<{ pipeline: string; stage: string }>("select pipeline, stage from contacts where id = $1", [id]);
  const n = c && nextStage(c.pipeline, c.stage);
  if (!n) throw new Error("已经是最后一步");
  await moveContact(me, id, n.key);
  return n.label;
}

export async function logTouch(me: Actor, id: number, input: { kind: string; body: string; nextStep?: string; nextDate?: string | null; stage?: string }) {
  const pipeline = await guard(me, id);
  const body = input.body.trim().slice(0, 4000);
  const kind = ["email", "meeting", "call", "message", "note"].includes(input.kind) ? input.kind : "note";
  if (!body && !input.nextStep && !input.stage) throw new Error("写点内容");
  if (body) await q("insert into touches (contact_id, user_id, kind, body) values ($1, $2, $3, $4)", [id, me.id, kind, body]);
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [id];
  if (body && kind !== "note") sets.push("last_touch_at = now()");
  if (input.nextStep !== undefined) { params.push(input.nextStep.trim().slice(0, 300)); sets.push(`next_step = $${params.length}`); }
  if (input.nextDate !== undefined) { params.push(input.nextDate || null); sets.push(`next_date = $${params.length}`); }
  await q(`update contacts set ${sets.join(", ")} where id = $1`, params);
  if (input.stage) {
    const before = await one<{ stage: string }>("select stage from contacts where id = $1", [id]);
    if (before && before.stage !== input.stage && stagesOf(pipeline).some((s) => s.key === input.stage)) {
      await q("update contacts set stage = $2 where id = $1", [id, input.stage]);
      await stageTouch(me, id, pipeline, before.stage, input.stage);
    }
  }
}

export async function deleteContact(me: Actor, id: number) {
  await guard(me, id);
  const c = await one<{ owner_id: number | null }>("select owner_id from contacts where id = $1", [id]);
  if (c?.owner_id && c.owner_id !== me.id && me.role !== "admin") throw new Error("只有负责人或管理员可以删除");
  await q("delete from contacts where id = $1", [id]);
}

export async function saveRound(me: Actor, input: { id?: number; name: string; target: string | number; currency: string; instrument: string; valuation: string; closeDate: string | null; status?: string }) {
  if (!(await canSee(me, "investor"))) throw new Error("没有权限");
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("填轮次名称");
  const target = (typeof input.target === "number" ? input.target : parseMoney(input.target)) ?? 0;
  const currency = ["USD", "CNY", "EUR"].includes(input.currency) ? input.currency : "USD";
  const close = input.closeDate && /^\d{4}-\d{2}-\d{2}$/.test(input.closeDate) ? input.closeDate : null;
  if (input.id) {
    await q("update rounds set name = $2, target = $3, currency = $4, instrument = $5, valuation = $6, close_date = $7, status = coalesce($8, status) where id = $1",
      [input.id, name, target, currency, input.instrument.slice(0, 40), input.valuation.slice(0, 80), close, input.status ?? null]);
    return input.id;
  }
  await q("update rounds set status = 'closed' where status = 'active'");
  const r = await one<{ id: number }>("insert into rounds (name, target, currency, instrument, valuation, close_date) values ($1, $2, $3, $4, $5, $6) returning id",
    [name, target, currency, input.instrument.slice(0, 40), input.valuation.slice(0, 80), close]);
  // Investors not attached to any round join the new one.
  await q("update contacts set round_id = $1 where pipeline = 'investor' and round_id is null", [r!.id]);
  return r!.id;
}

/* ───────────── CSV ───────────── */

export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.split("，").length > firstLine.split(",").length ? "，" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const COLUMN_HINTS: [keyof ContactInput | "owner", RegExp][] = [
  ["org", /^(org|firm|fund|company|机构|公司|基金|组织|单位)/i],
  ["name", /^(name|contact|person|partner|姓名|联系人|名字|投资人)/i],
  ["title", /^(title|role|position|职位|头衔|职务)/i],
  ["email", /(e-?mail|邮箱)/i],
  ["handle", /(wechat|微信|phone|电话|手机|lark|飞书|telegram)/i],
  ["link", /(linkedin|url|link|website|网站|链接|主页)/i],
  ["stage", /^(stage|status|阶段|状态)/i],
  ["amount", /(amount|check|size|金额|额度|ticket)/i],
  ["heat", /(heat|priority|热度|优先)/i],
  ["introBy", /(intro|referr|引荐|介绍人)/i],
  ["notes", /(note|comment|备注|说明)/i],
  ["owner", /(owner|负责人|跟进人)/i],
];

export function mapColumns(header: string[]) {
  const map: Record<number, keyof ContactInput | "owner"> = {};
  header.forEach((h, i) => {
    const hit = COLUMN_HINTS.find(([k, re]) => re.test(h.trim()) && !Object.values(map).includes(k));
    if (hit) map[i] = hit[0];
  });
  return map;
}

export async function importContacts(me: Actor, pipeline: Pipeline, text: string) {
  if (!(await canSee(me, pipeline))) throw new Error("没有权限");
  const rows = parseCSV(text).slice(0, 2001);
  if (!rows.length) throw new Error("没有识别到数据");
  let map = mapColumns(rows[0]);
  let body = rows.slice(1);
  if (!Object.values(map).some((k) => k === "org" || k === "name")) {
    // No header: assume 机构, 联系人, 邮箱.
    map = { 0: "org", 1: "name", 2: "email" };
    body = rows;
  }
  const members = await q<{ id: number; name: string; email: string }>("select id, coalesce(name, '') as name, email from users");
  const existing = await q<{ email: string; key: string }>("select lower(email) as email, lower(org || '|' || name) as key from contacts where pipeline = $1", [pipeline]);
  const seenEmail = new Set(existing.map((e) => e.email).filter(Boolean));
  const seenKey = new Set(existing.map((e) => e.key));
  const stages = stagesOf(pipeline);
  const round = pipeline === "investor" ? (await activeRound())?.id ?? null : null;
  let added = 0, skipped = 0;
  for (const r of body) {
    const rec: Record<string, string> = {};
    for (const [i, k] of Object.entries(map)) rec[k] = r[Number(i)] ?? "";
    if (!rec.org && !rec.name) { skipped++; continue; }
    const email = (rec.email ?? "").toLowerCase();
    const key = `${rec.org ?? ""}|${rec.name ?? ""}`.toLowerCase();
    if ((email && seenEmail.has(email)) || seenKey.has(key)) { skipped++; continue; }
    seenEmail.add(email); seenKey.add(key);
    const stage = stages.find((s) => s.key === rec.stage || s.label === rec.stage)?.key ?? "target";
    const heat = /hot|热|高/i.test(rec.heat ?? "") ? "hot" : /cold|冷|低/i.test(rec.heat ?? "") ? "cold" : "warm";
    const owner = rec.owner ? members.find((m) => m.name === rec.owner || m.email === rec.owner.toLowerCase())?.id ?? me.id : me.id;
    await q(
      `insert into contacts (pipeline, name, org, title, email, handle, link, stage, heat, owner_id, round_id, amount, intro_by, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [pipeline, (rec.name ?? "").slice(0, 120), (rec.org ?? "").slice(0, 160), (rec.title ?? "").slice(0, 120), (rec.email ?? "").slice(0, 200),
        (rec.handle ?? "").slice(0, 200), (rec.link ?? "").slice(0, 400), stage, heat, owner, round, parseMoney(rec.amount), (rec.introBy ?? "").slice(0, 120), (rec.notes ?? "").slice(0, 5000)],
    );
    added++;
  }
  return { added, skipped };
}

export function toCSV(contacts: Contact[]) {
  const cols: [string, (c: Contact) => string | number | null][] = [
    ["机构", (c) => c.org], ["联系人", (c) => c.name], ["职位", (c) => c.title], ["邮箱", (c) => c.email], ["其他联系方式", (c) => c.handle],
    ["链接", (c) => c.link], ["阶段", (c) => stageLabel(c.pipeline, c.stage)], ["热度", (c) => ({ hot: "热", warm: "温", cold: "冷" })[c.heat] ?? c.heat],
    ["金额", (c) => c.amount], ["负责人", (c) => c.owner_name], ["引荐人", (c) => c.intro_by], ["下一步", (c) => c.next_step],
    ["跟进日期", (c) => c.next_date], ["最近联系", (c) => c.last_touch_at?.slice(0, 10) ?? ""], ["备注", (c) => c.notes],
  ];
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map(([h]) => h).join(","), ...contacts.map((c) => cols.map(([, f]) => esc(f(c))).join(","))].join("\r\n");
}

/* ───────────── lookup for MCP / AI ───────────── */

export async function findContact(me: Actor, query: string, pipeline?: string) {
  const s = query.trim().toLowerCase();
  if (!s) return null;
  const pipes = await visiblePipelines(me);
  const rows = await q<Contact>(
    `${SELECT} where c.pipeline = any($1) and ($2::text is null or c.pipeline = $2)
       and (lower(c.org) = $3 or lower(c.name) = $3 or lower(c.email) = $3 or position($3 in lower(c.org || ' ' || c.name)) > 0 or position(lower(c.org) in $3) > 0 and c.org <> '')
     order by (lower(c.org) = $3 or lower(c.name) = $3) desc, c.updated_at desc limit 1`,
    [pipes, pipeline ?? null, s],
  );
  return rows[0] ?? null;
}

export function contactLine(c: Contact, currency = "USD") {
  const who = [c.org, c.name].filter(Boolean).join(" · ");
  const parts = [stageLabel(c.pipeline, c.stage)];
  if (c.amount) parts.push(`${currency === "CNY" ? "¥" : "$"}${Math.round(c.amount).toLocaleString()}`);
  if (c.owner_name) parts.push(`负责：${c.owner_name}`);
  if (c.next_step) parts.push(`下一步：${c.next_step}${c.next_date ? `（${c.next_date}）` : ""}`);
  if (c.last_touch_at) parts.push(`最近联系 ${c.last_touch_at.slice(0, 10)}`);
  return `- #${c.id} ${who}：${parts.join("；")}`;
}

/** Follow-ups owned by `me` with a date up to `until` (for the overview and reminders). */
export async function myFollowUps(me: Actor, until: string) {
  const pipes = await visiblePipelines(me);
  return q<{ id: number; pipeline: Pipeline; who: string; next_step: string; next_date: string; heat: string }>(
    `select id, pipeline, coalesce(nullif(org, ''), name) as who, next_step, next_date, heat from contacts
     where owner_id = $1 and pipeline = any($2) and next_date is not null and next_date <= $3::date and stage not in ('closed', 'passed', 'won', 'lost')
     order by next_date limit 20`,
    [me.id, pipes, until],
  );
}
