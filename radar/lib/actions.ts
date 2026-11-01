"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resetToken, signOut } from "@/auth";
import { classifyPending } from "@/lib/ai";
import { capture } from "@/lib/capture";
import { generateBrief, sendBrief, type Brief } from "@/lib/brief";
import { PRESETS } from "@/lib/catalog";
import { COLLECTORS } from "@/lib/collectors";
import { one, q, setSetting } from "@/lib/db";
import { notify } from "@/lib/notify";
import { invalidateTopics, loadTopics, previewSource, runDue, runSource, type SourceRow } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { DEFAULT_TOPICS } from "@/lib/taxonomy";
import { clip, list } from "@/lib/text";

export type Result<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function admin() {
  const u = await requireUser();
  return u;
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

/* ───────── signals ───────── */

export async function toggleStar(id: number): Promise<Result<boolean>> {
  await requireUser();
  const r = await one<{ starred: boolean }>("update rd_signals set starred = not starred where id = $1 returning starred", [id]);
  revalidatePath("/", "layout");
  return { ok: true, data: r?.starred ?? false, message: r?.starred ? "已标星" : "已取消标星" };
}

export async function setDismissed(id: number, dismissed: boolean): Promise<Result> {
  await requireUser();
  await q("update rd_signals set dismissed = $2 where id = $1", [id, dismissed]);
  revalidatePath("/", "layout");
  return { ok: true, message: dismissed ? "已标记为不相关" : "已恢复" };
}

export async function setNote(id: number, note: string): Promise<Result> {
  await requireUser();
  await q("update rd_signals set note = $2 where id = $1", [id, clip(note.trim(), 2000)]);
  revalidatePath("/", "layout");
  return { ok: true, message: "已保存备注" };
}

export async function captureSignal(input: { url: string; title: string; text: string; intent: string; note: string; org: string }): Promise<Result<number>> {
  const u = await requireUser();
  try {
    const r = await capture(u.id, input);
    revalidatePath("/", "layout");
    return { ok: true, data: r.id, message: r.existed ? "这条已经收录过，已更新" : "已收录" };
  } catch (e) {
    return fail(e);
  }
}

/* ───────── themes (demand hypotheses) ───────── */

export async function createTheme(input: { title: string; thesis: string; topics: string[]; signalId?: number }): Promise<Result<number>> {
  const u = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "写一个标题" };
  const r = await one<{ id: number }>("insert into rd_themes (title, thesis, topics, owner_id) values ($1, $2, $3, $4) returning id", [clip(title, 200), clip(input.thesis.trim(), 4000), input.topics, u.id]);
  if (input.signalId) await q("insert into rd_theme_signals (theme_id, signal_id, added_by) values ($1, $2, $3) on conflict do nothing", [r!.id, input.signalId, u.id]);
  revalidatePath("/", "layout");
  return { ok: true, data: r!.id, message: "已创建需求假设" };
}

export async function updateTheme(id: number, patch: { title?: string; thesis?: string; status?: string; next_step?: string; topics?: string[] }): Promise<Result> {
  await requireUser();
  const t = await one<{ id: number }>("select id from rd_themes where id = $1", [id]);
  if (!t) return { ok: false, error: "不存在" };
  if (patch.status && !["watching", "validating", "building", "parked"].includes(patch.status)) return { ok: false, error: "状态无效" };
  await q(
    `update rd_themes set title = coalesce($2, title), thesis = coalesce($3, thesis), status = coalesce($4, status), next_step = coalesce($5, next_step),
       topics = coalesce($6, topics), updated_at = now() where id = $1`,
    [id, patch.title?.trim() || null, patch.thesis ?? null, patch.status ?? null, patch.next_step ?? null, patch.topics ?? null],
  );
  revalidatePath("/", "layout");
  return { ok: true, message: "已保存" };
}

export async function deleteTheme(id: number): Promise<Result> {
  await requireUser();
  await q("delete from rd_themes where id = $1", [id]);
  revalidatePath("/", "layout");
  redirect("/themes");
}

export async function addEvidence(themeId: number, signalId: number): Promise<Result> {
  const u = await requireUser();
  await q("insert into rd_theme_signals (theme_id, signal_id, added_by) values ($1, $2, $3) on conflict do nothing", [themeId, signalId, u.id]);
  await q("update rd_themes set updated_at = now() where id = $1", [themeId]);
  revalidatePath("/", "layout");
  return { ok: true, message: "已加为证据" };
}

export async function removeEvidence(themeId: number, signalId: number): Promise<Result> {
  await requireUser();
  await q("delete from rd_theme_signals where theme_id = $1 and signal_id = $2", [themeId, signalId]);
  revalidatePath("/", "layout");
  return { ok: true, message: "已移除" };
}

export async function addThemeNote(themeId: number, body: string): Promise<Result> {
  const u = await requireUser();
  if (!body.trim()) return { ok: false, error: "写点内容" };
  await q("insert into rd_notes (theme_id, user_id, body) values ($1, $2, $3)", [themeId, u.id, clip(body.trim(), 4000)]);
  await q("update rd_themes set updated_at = now() where id = $1", [themeId]);
  revalidatePath("/", "layout");
  return { ok: true, message: "已发表" };
}

/* ───────── sources ───────── */

function cleanConfig(kind: string, raw: Record<string, unknown>) {
  const def = COLLECTORS[kind];
  if (!def) throw new Error(`未知的渠道类型：${kind}`);
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = raw[f.key];
    if (f.type === "list") {
      const l = list(v);
      if (l.length) out[f.key] = l;
    } else if (f.type === "number") {
      if (v !== "" && v !== undefined && v !== null && !Number.isNaN(Number(v))) out[f.key] = Number(v);
    } else if (typeof v === "string" && v.trim()) out[f.key] = v.trim();
    else if (f.type === "select" && f.options?.length && !v) out[f.key] = f.options[0][0];
    if (f.required && (out[f.key] === undefined || out[f.key] === "")) throw new Error(`请填写「${f.label}」`);
  }
  return out;
}

export async function saveSource(input: { id?: number; kind: string; name: string; config: Record<string, unknown>; every_hours: number }): Promise<Result<number>> {
  const u = await admin();
  try {
    const config = cleanConfig(input.kind, input.config);
    const name = input.name.trim() || `${COLLECTORS[input.kind].label}${config.org ? ` · ${config.org}` : ""}`;
    const every = Math.max(1, Math.min(168, Math.round(input.every_hours || 24)));
    if (input.id) {
      await q("update rd_sources set name = $2, config = $3, every_hours = $4 where id = $1", [input.id, clip(name, 120), JSON.stringify(config), every]);
      revalidatePath("/", "layout");
      return { ok: true, data: input.id, message: "已保存" };
    }
    const r = await one<{ id: number }>("insert into rd_sources (kind, name, config, every_hours, created_by) values ($1, $2, $3, $4, $5) returning id", [input.kind, clip(name, 120), JSON.stringify(config), every, u.id]);
    revalidatePath("/", "layout");
    return { ok: true, data: r!.id, message: "已添加渠道，点「运行」立即抓一次" };
  } catch (e) {
    return fail(e);
  }
}

export async function addPreset(presetId: string): Promise<Result<number>> {
  const u = await admin();
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return { ok: false, error: "预设不存在" };
  const dup = await one<{ id: number }>("select id from rd_sources where state->>'preset' = $1", [p.id]);
  if (dup) return { ok: false, error: "这个渠道已经添加过了" };
  const r = await one<{ id: number }>("insert into rd_sources (kind, name, config, every_hours, state, created_by) values ($1, $2, $3, $4, $5, $6) returning id", [
    p.kind, p.name, JSON.stringify(p.config), p.every_hours ?? 24, JSON.stringify({ preset: p.id }), u.id,
  ]);
  revalidatePath("/", "layout");
  return { ok: true, data: r!.id, message: `已添加「${p.name}」` };
}

export async function setSourceEnabled(id: number, enabled: boolean): Promise<Result> {
  await admin();
  await q("update rd_sources set enabled = $2 where id = $1", [id, enabled]);
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "已启用" : "已暂停" };
}

export async function deleteSource(id: number): Promise<Result> {
  await admin();
  const s = await one<{ kind: string }>("select kind from rd_sources where id = $1", [id]);
  if (s?.kind === "manual") return { ok: false, error: "手动收录渠道不能删除" };
  await q("delete from rd_sources where id = $1", [id]);
  revalidatePath("/", "layout");
  return { ok: true, message: "已删除渠道和它的信号" };
}

export async function runSourceNow(id: number): Promise<Result> {
  await requireUser();
  const src = await one<SourceRow>("select * from rd_sources where id = $1", [id]);
  if (!src) return { ok: false, error: "渠道不存在" };
  const r = await runSource(src, "manual");
  revalidatePath("/", "layout");
  if (r.error) return { ok: false, error: r.error };
  return { ok: true, message: `抓到 ${r.found} 条，新增 ${r.new}${r.changed ? `，变化 ${r.changed}` : ""}${r.note ? `（${r.note}）` : ""}` };
}

export async function runAllNow(): Promise<Result> {
  await requireUser();
  const started = Date.now();
  const results = await runDue(240_000, "manual");
  const ai = await classifyPending(Math.max(10_000, 280_000 - (Date.now() - started)));
  revalidatePath("/", "layout");
  const errors = results.filter((r) => r.error).length;
  if (!results.length) return { ok: true, message: "所有渠道都是最新的（按各自的频率抓取）" };
  return {
    ok: true,
    message: `运行了 ${results.length} 个渠道，新增 ${results.reduce((n, r) => n + r.new, 0)} 条${errors ? `，${errors} 个失败（见渠道页）` : ""}${ai.done ? `，AI 分类 ${ai.done} 条` : ""}${ai.error ? `；AI：${ai.error}` : ""}`,
  };
}

export async function previewSourceAction(kind: string, config: Record<string, unknown>): Promise<Result<Awaited<ReturnType<typeof previewSource>>>> {
  await requireUser();
  try {
    return { ok: true, data: await previewSource(kind, cleanConfig(kind, config)) };
  } catch (e) {
    return fail(e);
  }
}

export async function previewPreset(presetId: string): Promise<Result<Awaited<ReturnType<typeof previewSource>>>> {
  await requireUser();
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return { ok: false, error: "预设不存在" };
  try {
    return { ok: true, data: await previewSource(p.kind, p.config) };
  } catch (e) {
    return fail(e);
  }
}

export async function classifyNow(): Promise<Result> {
  await requireUser();
  const r = await classifyPending(250_000, 400);
  revalidatePath("/", "layout");
  if (r.error) return { ok: false, error: `${r.done ? `已分类 ${r.done} 条，然后出错：` : ""}${r.error}` };
  return { ok: true, message: r.done ? `AI 已分类 ${r.done} 条` : "没有待分类的信号" };
}

/* ───────── topics & settings ───────── */

export async function saveTopic(input: { key: string; label: string; grp: string; keywords: string }): Promise<Result> {
  await admin();
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
  if (!key || !input.label.trim()) return { ok: false, error: "需要 key 和名称" };
  const kws = list(input.keywords).map((k) => clip(k, 80)).slice(0, 80);
  await q(
    `insert into rd_topics (key, label, grp, keywords, sort) values ($1, $2, $3, $4, (select coalesce(max(sort), 0) + 1 from rd_topics))
     on conflict (key) do update set label = excluded.label, grp = excluded.grp, keywords = excluded.keywords, archived = false`,
    [key, clip(input.label.trim(), 40), input.grp === "format" ? "format" : "domain", kws],
  );
  invalidateTopics();
  revalidatePath("/", "layout");
  return { ok: true, message: "已保存（新抓到的信号会用新关键词；旧信号点「重新分类」）" };
}

export async function archiveTopic(key: string): Promise<Result> {
  await admin();
  await q("update rd_topics set archived = true where key = $1", [key]);
  invalidateTopics();
  revalidatePath("/", "layout");
  return { ok: true, message: "已隐藏" };
}

export async function restoreDefaultTopics(): Promise<Result> {
  await admin();
  for (const [i, t] of DEFAULT_TOPICS.entries()) {
    await q(
      `insert into rd_topics (key, label, grp, keywords, color, sort) values ($1, $2, $3, $4, $5, $6)
       on conflict (key) do update set label = excluded.label, grp = excluded.grp, keywords = excluded.keywords, sort = excluded.sort, archived = false`,
      [t.key, t.label, t.grp, t.keywords, t.color, i],
    );
  }
  invalidateTopics();
  revalidatePath("/", "layout");
  return { ok: true, message: "已恢复默认主题词" };
}

/** Re-runs rule classification over stored signals (after editing topics). AI-classified rows keep their AI topics. */
export async function reclassifyAll(): Promise<Result> {
  await admin();
  const { classify } = await import("@/lib/classify");
  const topics = await loadTopics(true);
  const rows = await q<{ id: number; channel: string; title: string; body: string; org: string; org_type: string; is_listing: boolean; engagement: number; source_config: Record<string, unknown>; engine: string }>(
    `select s.id, s.channel, s.title, s.body, s.org, s.org_type, s.is_listing, s.engagement, src.config as source_config, s.engine
     from rd_signals s join rd_sources src on src.id = s.source_id where s.first_seen_at > now() - interval '120 days'`,
  );
  let n = 0;
  for (const r of rows) {
    const base = Number(r.source_config?.base);
    const c = classify({ channel: r.channel, title: r.title, body: r.body, org: r.org, orgType: r.org_type, isListing: r.is_listing, engagement: r.engagement, base: Number.isFinite(base) && base > 0 ? base : undefined }, topics);
    if (r.engine === "ai") {
      await q("update rd_signals set pay_min = $2, pay_max = $3, pay_unit = $4, subtype = $5 where id = $1", [r.id, c.pay?.min ?? null, c.pay?.max ?? null, c.pay?.unit ?? null, c.subtype]);
    } else {
      await q(
        "update rd_signals set topics = $2, buyers = $3, vendors = $4, category = $5, intent = case when channel = 'manual' then intent else $6 end, relevance = case when channel = 'manual' then greatest($7, 60) else $7 end, pay_min = $8, pay_max = $9, pay_unit = $10, subtype = $11 where id = $1",
        [r.id, c.topics, c.buyers, c.vendors, c.category, c.intent, c.relevance, c.pay?.min ?? null, c.pay?.max ?? null, c.pay?.unit ?? null, c.subtype],
      );
    }
    n++;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `已重新分类 ${n} 条信号` };
}

const SETTING_KEYS = ["min_relevance", "alert_min_relevance", "alerts", "brief_send", "brief_focus", "notify_feishu", "notify_slack", "notify_wecom", "workspace_name"] as const;

export async function saveSettings(values: Partial<Record<(typeof SETTING_KEYS)[number], string>>): Promise<Result> {
  await admin();
  for (const k of SETTING_KEYS) {
    const v = values[k];
    if (v === undefined) continue;
    if ((k === "min_relevance" || k === "alert_min_relevance") && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100)) return { ok: false, error: "相关度阈值是 0–100" };
    if (k.startsWith("notify_") && v && !/^https:\/\//.test(v.trim())) return { ok: false, error: "Webhook 地址需要以 https:// 开头" };
    await setSetting(k, v.trim());
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "已保存设置" };
}

export async function testNotify(): Promise<Result> {
  await requireUser();
  try {
    const on = await notify("需求雷达 · 测试消息", "如果你看到这条，说明通知渠道配置好了。", "/");
    return { ok: true, message: `已发送到 ${on.length} 个渠道` };
  } catch (e) {
    return fail(e);
  }
}

export async function resetMyToken(): Promise<Result> {
  const u = await requireUser();
  await resetToken(u.id);
  revalidatePath("/settings");
  return { ok: true, message: "已重置：旧的书签 / MCP 地址失效" };
}

/* ───────── brief ───────── */

export async function makeBrief(send: boolean): Promise<Result<Brief>> {
  await requireUser();
  try {
    const b = await generateBrief({ send });
    revalidatePath("/brief");
    const aiError = (b.stats as { aiError?: string }).aiError;
    return { ok: true, data: b, message: `${b.engine === "ai" ? "AI 已写好本周简报" : "已生成统计版简报"}${send ? (b.sent_at ? "，已发送" : "（没有配置通知渠道，未发送）") : ""}${aiError ? `；AI 出错：${aiError}` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function sendBriefNow(id: number): Promise<Result> {
  await requireUser();
  const b = await one<Brief>("select id, week, body, engine, created_at, sent_at, stats from rd_briefs where id = $1", [id]);
  if (!b) return { ok: false, error: "简报不存在" };
  const sent = await sendBrief(b);
  revalidatePath("/brief");
  return sent.length ? { ok: true, message: `已发送到 ${sent.length} 个渠道` } : { ok: false, error: "没有配置通知渠道（设置 → 通知）或发送失败" };
}

export async function getContextPack(days = 7): Promise<Result<string>> {
  await requireUser();
  const { collectStats, contextText } = await import("@/lib/brief");
  const { ANALYZE_PROMPT } = await import("@/lib/ai");
  return { ok: true, data: `${ANALYZE_PROMPT}\n\n${contextText(await collectStats(days))}` };
}
