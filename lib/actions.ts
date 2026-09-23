"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import * as core from "@/lib/core";
import { one, q } from "@/lib/db";
import { aiEnabled, askWithAI } from "@/lib/ai";
import { buildDigest, pushDigest } from "@/lib/digest";
import { notifyStrict } from "@/lib/notify";
import { PROJECT_COLORS, type Subtask } from "@/lib/meta";
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
    return r.published ? `已发布 ${r.published} 条到团队` : "已归档，没有发布任何条目";
  });
}

export async function keepPrivate(convId: number) {
  const me = await requireUser();
  return run(async () => {
    await core.keepPrivate(me, convId);
    return "已保存，只有你自己能看到";
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
    return item?.status === "confirmed" ? "已达成共识 ✓" : "已记录你的同意";
  });
}

export async function object(itemId: number, comment: string) {
  const me = await requireUser();
  return run(async () => {
    await core.ack(me, itemId, "object", comment.slice(0, 300));
    await core.addComment(me, itemId, `提出异议：${comment.slice(0, 300)}`);
    return "已记录异议，创建者会看到";
  });
}

export async function confirmNow(itemId: number) {
  const me = await requireUser();
  return run(async () => {
    const item = await core.getItem(itemId);
    if (!item) throw new Error("找不到决策");
    if (item.owner_id !== me.id && me.role !== "admin") throw new Error("只有创建者或管理员可以直接拍板");
    await core.confirmDecision(itemId, me);
    return "已拍板，形成共识";
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
    await q("update items set status = 'discussing', superseded_by = null, updated_at = now() where id = $1 and kind = 'decision'", [itemId]);
    await q("delete from acks where item_id = $1 and user_id <> $2", [itemId, me.id]);
    await core.logEvent(me.id, "reopen", "重新打开讨论", itemId);
    return "已重新打开讨论";
  });
}

/* ───────────── items ───────────── */

export async function createItem(input: { kind: string; title: string; body?: string; projectId?: number | null; assigneeId?: number | null; due?: string; subtasks?: string[]; blockedBy?: number | null }) {
  const me = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "请填写标题" } as Result;
  return run(async () => {
    await core.createItem(me, { ...input, title: input.title.trim() });
    return "已创建";
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

export async function editItem(itemId: number, patch: { title?: string; body?: string; due?: string; assigneeId?: number | null; projectId?: number | null }) {
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
    await q("update items set status = 'resolved', updated_at = now() where id = $1 and kind = 'question'", [itemId]);
    await core.logEvent(me.id, "resolve", "问题已解决", itemId);
    return "已标记为解决";
  });
}

/* ───────────── ask ───────────── */

export async function askTeam(question: string): Promise<{ answer: string; ai: boolean; cites: { id: number; kind: string; title: string; status: string }[] }> {
  const me = await requireUser();
  const hits = await core.search(me.id, question, 40);
  const pool = hits.length >= 8 ? hits : [...hits, ...(await core.listItems(me.id, { limit: 60 })).filter((i) => !hits.some((h) => h.id === i.id))].slice(0, 60);
  if (!aiEnabled()) {
    return {
      ai: false,
      answer: hits.length ? `找到 ${hits.length} 条相关记录（配置 ANTHROPIC_API_KEY 后可以直接得到总结回答）。` : "没有找到相关记录。",
      cites: hits.slice(0, 10).map((h) => ({ id: h.id, kind: h.kind, title: h.title, status: h.status })),
    };
  }
  try {
    const answer = await askWithAI(question, pool.map(core.itemLine).join("\n"));
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
    return `测试消息已发送（${on.length} 个渠道）`;
  });
}

export async function setAutoPublish(on: boolean) {
  const me = await requireUser();
  return run(async () => {
    await q("update users set auto_publish = $2 where id = $1", [me.id, on]);
    return on ? "已开启自动发布：同步后直接发给团队，敏感内容仍会留在收件箱" : "已关闭自动发布：同步的内容先进收件箱";
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
    return `已邀请 ${e}，把网址发给 TA 登录即可`;
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
    return "已生成新的个人密钥，旧的已失效";
  });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
