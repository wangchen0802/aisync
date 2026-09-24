"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core";
import { one, q } from "@/lib/db";
import { aiEnabled, askWithAI, draftOutreachWithAI, outreachPrompt } from "@/lib/ai";
import * as out from "@/lib/outreach";
import { fmtMoney, pipelineOf, stageLabel, type Pipeline } from "@/lib/outreach-meta";
import { buildDigest, pushDigest } from "@/lib/digest";
import { notifyStrict } from "@/lib/notify";
import { code, PROJECT_COLORS, type Subtask } from "@/lib/meta";
import { signOut } from "@/auth";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: () => Promise<string | void>): Promise<Result> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "操作失败，请重试" };
  }
}

/* ───────────── import & inbox ───────────── */

export async function importConversation(_: unknown, form: FormData): Promise<Result> {
  const me = await requireUser();
  const text = String(form.get("text") ?? "").trim();
  if (text.length < 20) return { ok: false, error: "对话内容太短了，至少粘贴几轮对话。" };
  const projectId = Number(form.get("projectId")) || null;
  let result: core.IngestResult | null = null;
  const res = await run(async () => {
    const r = await core.ingestConversation(me, {
      source: String(form.get("source") || "other"),
      title: String(form.get("title") || "").trim() || undefined,
      url: String(form.get("url") || "").trim() || undefined,
      text,
      projectId,
    });
    result = r;
  });
  if (!res.ok) return res;
  const r = result as core.IngestResult | null;
  if (!r) return { ok: false, error: "导入失败，请重试" };
  if (r.unchanged) return { ok: false, error: "这段对话之前已经同步过，没有新内容。" };
  const pending = r.items + r.updates - r.published;
  if (r.auto && pending <= 0) redirect(`/activity?synced=${r.published}`);
  redirect(`/inbox?c=${r.id}`);
}

export async function publishConversation(convId: number, picks: core.Pick[], projectId: number | null) {
  const me = await requireUser();
  return run(async () => {
    const r = await core.publishConversation(me, convId, picks, projectId);
    return r.published ? `已发布 ${r.published} 条` : "已归档";
  });
}

export async function keepPrivate(convId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.keepPrivate(me, convId);
    return "已设为仅自己可见";
  });
}

export async function discardConversation(convId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.discardConversation(me, convId);
    return "已丢弃";
  });
}

/* ───────────── consensus ───────────── */

export async function agree(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.ack(me, itemId, "agree");
    const item = await core.getItem(itemId);
    return item?.status === "confirmed" ? "已生效" : "已同意";
  });
}

export async function object(itemId: number, comment: string) {
  const me = await requireUser();
  return run(async () => {
    await core.ack(me, itemId, "object", comment.slice(0, 300));
    await core.addComment(me, itemId, `提出异议：${comment.slice(0, 300)}`);
    return "已提交";
  });
}

export async function confirmNow(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.assertVisible(me.id, itemId);
    const item = await core.getItem(itemId);
    if (!item) throw new Error("找不到决策");
    if (item.owner_id !== me.id && me.role !== "admin") throw new Error("只有创建者或管理员可以直接拍板");
    await core.confirmDecision(itemId, me);
    return "已生效";
  });
}

export async function resolveConflict(itemId: number, keep: "this" | "other") {
  const me = await requireUser();
  return run(async () => {
    await core.resolveConflict(me, itemId, keep);
    return "冲突已解决";
  });
}

export async function reopenDecision(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.assertVisible(me.id, itemId);
    await q("update items set status = 'discussing', superseded_by = null, updated_at = now() where id = $1 and kind = 'decision'", [itemId]);
    await q("delete from acks where item_id = $1 and user_id <> $2", [itemId, me.id]);
    await core.logEvent(me.id, "reopen", "重新打开讨论", itemId);
    return "已重新打开";
  });
}

/* ───────────── items ───────────── */

export async function createItem(input: Omit<core.NewItem, "source">) {
  const me = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "请填写标题" } as Result;
  return run(async () => {
    await core.createItem(me, { ...input, title: input.title.trim() });
    return input.kind === "idea" ? "已保存" : "已创建";
  });
}

export async function moveTask(taskId: number, status: string) {
  const me = await requireUser();
  return run(() => core.moveTask(me, taskId, status));
}

export async function setSubtasks(taskId: number, subtasks: Subtask[]) {
  const me = await requireUser();
  return run(() => core.setSubtasks(me, taskId, subtasks));
}

export async function editItem(itemId: number, patch: core.ItemPatch) {
  const me = await requireUser();
  return run(async () => {
    await core.editItem(me, itemId, patch);
    return "已保存";
  });
}

export async function deleteItem(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.deleteItem(me, itemId);
    return "已删除";
  });
}

export async function resolveQuestion(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.assertVisible(me.id, itemId);
    await q("update items set status = 'resolved', updated_at = now() where id = $1 and kind = 'question'", [itemId]);
    await core.logEvent(me.id, "resolve", "问题已解决", itemId);
    return "已标记为解决";
  });
}

/* ───────────── ask ───────────── */

const ASK_RULES = "你是团队记忆助手。只根据下面的团队条目回答，用中文，简洁直接。引用条目时在句末写编号，如 [D-12]。条目里找不到答案就直说不知道，并建议去问谁。不要编造。";

export async function askTeam(question: string): Promise<{ answer: string; ai: boolean; prompt?: string; cites: { id: number; kind: string; title: string; status: string }[] }> {
  const me = await requireUser();
  const hits = await core.search(me.id, question, 40);
  const pool = hits.length >= 8 ? hits : [...hits, ...(await core.listItems(me.id, { limit: 60 })).filter((i) => !hits.some((h) => h.id === i.id))].slice(0, 60);
  if (!aiEnabled()) {
    let ctx = "";
    for (const i of pool) { const l = core.itemLine(i); if (ctx.length + l.length > 5000) break; ctx += l + "\n"; }
    return {
      ai: false,
      prompt: `${ASK_RULES}\n\n团队条目：\n${ctx}\n问题：${question}`,
      answer: hits.length ? `找到 ${hits.length} 条相关记录。要一句话的总结，可以把问题连同这些记录交给你的 AI：` : "没有直接相关的记录。可以把问题连同团队最近的记录交给你的 AI：",
      cites: hits.slice(0, 10).map((h) => ({ id: h.id, kind: h.kind, title: h.title, status: h.status })),
    };
  }
  try {
    const answer = await askWithAI(question, pool.map((i) => core.itemLine(i)).join("\n"));
    const codes = new Set([...answer.matchAll(/\[([DTIQ])-(\d+)\]/g)].map((m) => Number(m[2])));
    return { ai: true, answer, cites: pool.filter((i) => codes.has(i.id)).map((h) => ({ id: h.id, kind: h.kind, title: h.title, status: h.status })) };
  } catch (e) {
    console.error(e);
    return { ai: false, answer: "AI 暂时不可用，下面是关键词匹配的结果。", cites: hits.slice(0, 10).map((h) => ({ id: h.id, kind: h.kind, title: h.title, status: h.status })) };
  }
}

/* ───────────── digest ───────────── */

export async function sendDigest() {
  await requireUser();
  return run(async () => {
    const channels = await pushDigest(await buildDigest());
    return `已推送到 ${channels.map((c) => ({ slack: "Slack", feishu: "飞书", wecom: "企业微信" })[c]).join("、")}`;
  });
}

export async function saveNotifications(input: { slack: string; feishu: string; wecom: string }) {
  const me = await requireUser();
  return run(async () => {
    if (me.role !== "admin") throw new Error("只有管理员可以修改通知设置");
    for (const [k, v] of Object.entries(input)) {
      const url = v.trim();
      if (url && !/^https:\/\//.test(url)) throw new Error("Webhook 地址需要以 https:// 开头");
      await core.setSetting(`notify_${k}`, url);
    }
    return "通知设置已保存";
  });
}

export async function testNotification() {
  const me = await requireUser();
  return run(async () => {
    const on = await notifyStrict("SimReal Sync 通知测试", [`${me.name} 刚刚测试了团队通知。之后新决策、冲突、达成共识和每日简报都会发到这里。`], "/");
    return `已发送（${on.length} 个渠道）`;
  });
}

export async function setAutoPublish(on: boolean) {
  const me = await requireUser();
  return run(async () => {
    await q("update users set auto_publish = $2 where id = $1", [me.id, on]);
    return on ? "已开启自动发布" : "已关闭自动发布";
  });
}

export async function addComment(itemId: number, body: string) {
  const me = await requireUser();
  return run(async () => {
    await core.addComment(me, itemId, body);
  });
}

/* ───────────── settings ───────────── */

export async function saveProject(input: { id?: number; name: string; description: string; color?: string }) {
  await requireUser();
  if (!input.name.trim()) return { ok: false, error: "项目名称不能为空" } as Result;
  return run(async () => {
    if (input.id) {
      await q("update projects set name = $2, description = $3, color = coalesce($4, color) where id = $1", [input.id, input.name.trim(), input.description.trim(), input.color ?? null]);
      return "项目已更新";
    }
    const n = (await one<{ c: number }>("select count(*)::int as c from projects"))?.c ?? 0;
    await q("insert into projects (name, description, color) values ($1, $2, $3)", [input.name.trim(), input.description.trim(), input.color ?? PROJECT_COLORS[n % PROJECT_COLORS.length]]);
    return "项目已创建";
  });
}

export async function archiveProject(id: number, archived: boolean) {
  await requireUser();
  return run(async () => {
    await q("update projects set archived = $2 where id = $1", [id, archived]);
    return archived ? "项目已归档" : "项目已恢复";
  });
}

export async function inviteMember(email: string, name: string) {
  const me = await requireUser();
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: "邮箱格式不正确" } as Result;
  return run(async () => {
    if (me.role !== "admin") throw new Error("只有管理员可以邀请成员");
    await q("insert into users (email, name, invited) values ($1, $2, true) on conflict (email) do nothing", [e, name.trim() || e.split("@")[0]]);
    return `已邀请 ${e}`;
  });
}

export async function setMemberRole(userId: number, role: "admin" | "member") {
  const me = await requireUser();
  return run(async () => {
    if (me.role !== "admin") throw new Error("只有管理员可以修改权限");
    if (userId === me.id && role !== "admin") throw new Error("不能取消自己的管理员权限");
    await q("update users set role = $2 where id = $1", [userId, role]);
    return "权限已更新";
  });
}

export async function removeMember(userId: number) {
  const me = await requireUser();
  return run(async () => {
    if (me.role !== "admin") throw new Error("只有管理员可以移除成员");
    if (userId === me.id) throw new Error("不能移除自己");
    await q("delete from users where id = $1", [userId]);
    return "成员已移除";
  });
}

export async function saveWorkspace(input: { name: string; threshold: number }) {
  const me = await requireUser();
  return run(async () => {
    if (me.role !== "admin") throw new Error("只有管理员可以修改设置");
    await core.setSetting("workspace_name", input.name.trim() || "SimReal");
    await core.setSetting("ack_threshold", String(Math.min(10, Math.max(1, Math.round(input.threshold) || 2))));
    return "设置已保存";
  });
}

export async function updateProfile(name: string) {
  const me = await requireUser();
  return run(async () => {
    await q("update users set name = $2 where id = $1", [me.id, name.trim().slice(0, 40) || me.email.split("@")[0]]);
    return "已保存";
  });
}

export async function regenerateToken() {
  const me = await requireUser();
  return run(async () => {
    await q("update users set api_token = $2 where id = $1", [me.id, `sr_${randomBytes(24).toString("base64url")}`]);
    return "密钥已重置";
  });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

/* ───────────── ideas ───────────── */

export async function shareIdea(id: number) {
  const me = await requireUser();
  return run(async () => {
    await core.shareIdea(me, id);
    return "已分享给团队";
  });
}

export async function convertIdea(id: number, kind: "decision" | "task" | "question") {
  const me = await requireUser();
  return run(async () => {
    const newId = await core.convertIdea(me, id, kind);
    return `已转为${{ decision: "决策", task: "任务", question: "待定问题" }[kind]} ${code(kind, newId)}`;
  });
}

/* ───────────── weekly goals ───────────── */

export async function saveGoal(input: { id?: number; title: string; scope: "team" | "personal"; projectId?: number | null; week?: string; note?: string; status?: string; manualProgress?: number | null }) {
  const me = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "目标不能为空" } as Result;
  return run(async () => {
    await core.saveGoal(me, { ...input, title: input.title.trim() });
    return input.id ? "目标已更新" : "已添加本周目标";
  });
}

export async function setGoalStatus(id: number, status: "on_track" | "at_risk" | "done" | "missed") {
  const me = await requireUser();
  return run(async () => {
    await q("update goals set status = $2, updated_at = now() where id = $1 and (scope = 'team' or owner_id = $3)", [id, status, me.id]);
  });
}

export async function deleteGoal(id: number) {
  const me = await requireUser();
  return run(async () => {
    await q("update items set goal_id = null where goal_id = $1", [id]);
    await q("delete from goals where id = $1 and (owner_id = $2 or $3)", [id, me.id, me.role === "admin"]);
    return "目标已删除";
  });
}

export async function carryOverGoals(fromWeek: string, toWeek: string) {
  const me = await requireUser();
  return run(async () => {
    const n = await core.carryOverGoals(me, fromWeek, toWeek);
    return n ? `已延续 ${n} 个目标` : "没有未完成的目标";
  });
}

/* ───────────── context ───────────── */

export async function saveTeamBrief(text: string) {
  const me = await requireUser();
  return run(async () => {
    await core.setSetting("team_brief", text.slice(0, 8000));
    await core.setSetting("team_brief_meta", JSON.stringify({ by: me.name, at: new Date().toISOString() }));
    await core.logEvent(me.id, "context", "更新了团队档案");
    return "已保存";
  });
}

export async function saveProjectContext(projectId: number, text: string) {
  const me = await requireUser();
  return run(async () => {
    await q("update projects set context = $2 where id = $1", [projectId, text.slice(0, 6000)]);
    await core.logEvent(me.id, "context", "更新了项目背景");
    return "已保存";
  });
}

export async function previewContext(opts: { scope: core.ContextScope; projectId?: number | null; topic?: string; budget?: number }) {
  const me = await requireUser();
  return core.buildContext(me.id, { ...opts, projectId: opts.scope === "project" ? opts.projectId ?? null : null });
}

export async function rotateContextKey() {
  const me = await requireUser();
  return run(async () => {
    await q("update users set context_key = $2 where id = $1", [me.id, `ctx_${randomBytes(18).toString("base64url")}`]);
    return "链接已重置";
  });
}

export async function pushWeeklyReview(week: string) {
  const me = await requireUser();
  return run(async () => {
    const mon = week;
    const sun = new Date(new Date(`${mon}T00:00:00Z`).getTime() + 6 * 864e5).toISOString().slice(0, 10);
    const goals = (await core.listGoals(me.id, mon)).filter((g) => g.scope === "team");
    const done = await q<{ title: string; who: string | null }>(
      "select i.title, u.name as who from items i left join users u on u.id = i.assignee_id where i.kind = 'task' and i.visibility = 'team' and i.completed_at >= ($1::date - interval '8 hours') and i.completed_at < ($2::date + interval '16 hours') order by i.completed_at",
      [mon, sun],
    );
    const decided = await q<{ id: number; title: string }>(
      "select id, title from items where kind = 'decision' and visibility = 'team' and status = 'confirmed' and updated_at >= $1::date and updated_at < ($2::date + 1)",
      [mon, sun],
    );
    const ws = await core.getSetting("workspace_name", "SimReal");
    await notifyStrict(`🗓 ${ws} 本周回顾（${mon.slice(5)} – ${sun.slice(5)}）`, [
      "**目标**",
      ...(goals.length ? goals.map((g) => `${g.status === "done" ? "✅" : g.status === "at_risk" ? "⚠️" : "•"} ${g.title}（${core.goalPct(g)}%）`) : ["（本周没有设定目标）"]),
      "",
      `**完成 ${done.length} 个任务**`,
      ...done.slice(0, 12).map((d) => `✓ ${d.title}${d.who ? `（${d.who}）` : ""}`),
      ...(decided.length ? ["", `**达成 ${decided.length} 项共识**`, ...decided.slice(0, 8).map((d) => `• ${code("decision", d.id)} ${d.title}`)] : []),
    ], `/week?w=${mon}`);
    return "已发到群";
  });
}

/* ───────────── fundraising & outreach ───────────── */

export async function saveContact(input: out.ContactInput) {
  const me = await requireUser();
  let id = 0;
  const r = await run(async () => {
    id = await out.saveContact(me, input);
    return input.id ? "已保存" : "已添加";
  });
  return r.ok ? { ...r, id } : r;
}

export async function moveContact(id: number, stage: string) {
  const me = await requireUser();
  return run(async () => { await out.moveContact(me, id, stage); });
}

export async function advanceContact(id: number) {
  const me = await requireUser();
  return run(async () => `→ ${await out.advanceContact(me, id)}`);
}

export async function logTouch(id: number, input: { kind: string; body: string; nextStep?: string; nextDate?: string | null; stage?: string }) {
  const me = await requireUser();
  return run(async () => {
    await out.logTouch(me, id, input);
    return "已记录";
  });
}

export async function deleteContact(id: number) {
  const me = await requireUser();
  return run(async () => {
    await out.deleteContact(me, id);
    return "已删除";
  });
}

export async function saveRound(input: { id?: number; name: string; target: string; currency: string; instrument: string; valuation: string; closeDate: string | null; status?: string }) {
  const me = await requireUser();
  return run(async () => {
    await out.saveRound(me, input);
    return input.id ? "已保存" : "已开启新一轮";
  });
}

export async function setInvestorAccess(v: "all" | "admins") {
  const me = await requireUser();
  if (me.role !== "admin") return { ok: false, error: "只有管理员可以修改" } as Result;
  return run(async () => {
    await core.setSetting("outreach_investor_access", v);
    return v === "admins" ? "融资只对管理员可见" : "融资对全员可见";
  });
}

export async function importContacts(pipeline: Pipeline, text: string) {
  const me = await requireUser();
  return run(async () => {
    const r = await out.importContacts(me, pipeline, text);
    return `导入 ${r.added} 个${r.skipped ? `，跳过 ${r.skipped} 个（重复或空行）` : ""}`;
  });
}

export async function previewImport(text: string) {
  await requireUser();
  const rows = out.parseCSV(text).slice(0, 6);
  if (!rows.length) return { columns: [] as string[], rows: 0 };
  const map = out.mapColumns(rows[0]);
  const LABEL: Record<string, string> = { org: "机构", name: "联系人", title: "职位", email: "邮箱", handle: "联系方式", link: "链接", stage: "阶段", amount: "金额", heat: "热度", introBy: "引荐人", notes: "备注", owner: "负责人" };
  const hasHeader = Object.values(map).some((k) => k === "org" || k === "name");
  const total = out.parseCSV(text).length - (hasHeader ? 1 : 0);
  return { columns: hasHeader ? Object.values(map).map((k) => LABEL[k] ?? k) : ["机构", "联系人", "邮箱"], rows: total };
}

export async function draftFollowUp(id: number, lang: "zh" | "en") {
  const me = await requireUser();
  const c = await out.getContact(me, id);
  if (!c) return { ok: false as const, error: "找不到联系人" };
  const [touches, brief, round] = await Promise.all([out.listTouches(id, 8), core.getSetting("team_brief", ""), c.pipeline === "investor" ? out.activeRound() : null]);
  const p = pipelineOf(c.pipeline);
  const purpose = c.pipeline === "investor"
    ? `融资跟进${round ? `（${round.name}${round.target ? `，目标 ${fmtMoney(round.target, round.currency)}` : ""}${round.instrument ? `，${round.instrument}` : ""}）` : ""}，当前阶段：${stageLabel(c.pipeline, c.stage)}`
    : `${p.label}跟进，当前阶段：${stageLabel(c.pipeline, c.stage)}`;
  const contact = [c.name && `姓名：${c.name}`, c.org && `机构：${c.org}`, c.title && `职位：${c.title}`, c.intro_by && `引荐人：${c.intro_by}`, c.notes && `备注：${c.notes.slice(0, 600)}`].filter(Boolean).join("\n");
  const history = touches.filter((t) => t.kind !== "stage").map((t) => `${t.created_at.slice(0, 10)} ${t.user_name ?? ""}（${t.kind}）：${t.body.slice(0, 400)}`).join("\n");
  const first = (c.name || c.org).split(/\s/)[0];
  const input = { lang, company: brief.slice(0, 2500), purpose, contact, history, next: c.next_step };
  const p2 = outreachPrompt(input);
  const prompt = `${p2.system}\n\n${p2.user}`.replaceAll("{我的名字}", me.name);
  if (aiEnabled()) {
    try {
      const text = await draftOutreachWithAI(input);
      return { ok: true as const, text: text.replaceAll("{我的名字}", me.name), ai: true, prompt };
    } catch (e) {
      console.error("draftFollowUp failed", e);
    }
  }
  const last = touches.find((t) => t.kind !== "stage");
  const text = lang === "en"
    ? `Subject: Following up${last ? " on our conversation" : ""}\n\nHi ${first},\n\n${last ? `Thanks again for the time on ${last.created_at.slice(5, 10)}. ` : ""}${c.next_step ? `As a next step: ${c.next_step}. ` : ""}Happy to send anything that would help — would a quick call next week work?\n\nBest,\n${me.name}`
    : `主题：跟进${last ? "上次的沟通" : ""}\n\n${first}您好，\n\n${last ? `感谢 ${last.created_at.slice(5, 10)} 的交流。` : ""}${c.next_step ? `下一步我们计划：${c.next_step}。` : ""}如果需要材料我随时发，下周方便再约 20 分钟吗？\n\n${me.name}`;
  return { ok: true as const, text, ai: false, prompt };
}
