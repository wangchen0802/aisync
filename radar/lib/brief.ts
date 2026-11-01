import "server-only";
import { aiEnabled, writeBriefWithAI } from "@/lib/ai";
import { getSetting, one, q } from "@/lib/db";
import { notifyQuiet } from "@/lib/notify";
import { fmtPay } from "@/lib/signals";
import { CHANNEL_META, INTENT_LABEL } from "@/lib/taxonomy";
import { clip, oneLine } from "@/lib/text";
import { boards, buyerMentions, minRelevance, overview, recentChanges, topicTrends, TS, vendorMentions } from "@/lib/trends";

/** Monday of the current week in Asia/Shanghai, as YYYY-MM-DD. */
export function weekOf(d = new Date()) {
  const local = new Date(d.getTime() + 8 * 3600_000);
  const day = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - day);
  return local.toISOString().slice(0, 10);
}

type TopSignal = {
  id: number; channel: string; title: string; summary: string; body: string; org: string; url: string | null; intent: string;
  relevance: number; pay_min: number | null; pay_max: number | null; pay_unit: string | null; starred: boolean; ts: string;
};

async function topSignals(days: number, limit: number): Promise<TopSignal[]> {
  const rel = await minRelevance();
  return q<TopSignal>(
    `select s.id, s.channel, s.title, s.summary, left(s.body, 260) as body, s.org, s.url, s.intent, s.relevance, s.pay_min, s.pay_max, s.pay_unit, s.starred, ${TS} as ts
     from rd_signals s
     where not s.dismissed and s.relevance >= $1 and ${TS} > now() - make_interval(days => $2)
       and not (s.is_listing and s.first_seen_at < now() - make_interval(days => $2))
     order by s.starred desc, (s.intent = 'demand') desc, s.relevance desc, s.engagement desc limit $3`,
    [rel, days, limit],
  );
}

export type BriefStats = Awaited<ReturnType<typeof collectStats>>;

export async function collectStats(days = 7) {
  const [ov, trends, buyers, vendors, bds, changes, signals] = await Promise.all([
    overview(),
    topicTrends(),
    buyerMentions(days * 2 > 30 ? 30 : days),
    vendorMentions(days * 2 > 30 ? 30 : days),
    boards(),
    recentChanges(40, ["opened", "closed", "pay_changed", "reopened", "page_changed"], days),
    topSignals(days, 60),
  ]);
  const rising = trends.filter((t) => t.now >= 2 && t.score > 0.8).sort((a, b) => b.score - a.score).slice(0, 8);
  const falling = trends.filter((t) => t.base >= 3 && t.now < t.base * 0.5).sort((a, b) => a.score - b.score).slice(0, 5);
  const busiest = [...trends].sort((a, b) => b.now - a.now).slice(0, 8).filter((t) => t.now > 0);
  return { days, ov, rising, falling, busiest, buyers, vendors, boards: bds.filter((b) => b.open || b.opened7 || b.closed7), changes, signals };
}

const pct = (now: number, prev: number) => (prev ? `${now >= prev ? "+" : ""}${Math.round(((now - prev) / prev) * 100)}%` : now ? "新出现" : "—");

function signalLine(s: TopSignal) {
  const pay = fmtPay(s.pay_min, s.pay_max, s.pay_unit);
  const what = s.summary || clip(oneLine(s.body), 140);
  return `[#${s.id}] ${CHANNEL_META[s.channel]?.label ?? s.channel} · ${INTENT_LABEL[s.intent] ?? s.intent}${s.org ? ` · ${s.org}` : ""}${pay ? ` · ${pay}` : ""}${s.starred ? " · ★" : ""}\n  ${s.title}${what && what !== s.title ? `\n  ${what}` : ""}${s.url ? `\n  ${s.url}` : ""}`;
}

/** Plain-text context pack: stats + top signals. Feeds Claude (API or the user's own subscription) and MCP. */
export function contextText(st: BriefStats, extra = "") {
  const o = st.ov;
  const lines = [
    `# 需求雷达 · 最近 ${st.days} 天（截至 ${new Date().toISOString().slice(0, 10)}）`,
    "",
    "## 概况",
    `- 新的相关信号 ${o.newSignals} 条（前一周 ${o.newSignalsPrev}，${pct(o.newSignals, o.newSignalsPrev)}）；明确需求 ${o.demand} 条（前一周 ${o.demandPrev}）`,
    `- 跟踪中的在招岗位 ${o.openListings} 个，其中专家 / 标注类 ${o.openExpert} 个；本周新增 ${o.opened}、下架 ${o.closed}${o.medianHourly ? `；在招岗位时薪中位数 $${o.medianHourly}/小时` : ""}`,
    "",
    "## 方向热度（本周 vs 前 4 周平均）",
    ...(st.rising.length ? st.rising.map((t) => `- ↑ ${t.label}：${t.now}（基线 ${t.base.toFixed(1)}）`) : ["- 暂无明显上升的方向"]),
    ...st.falling.map((t) => `- ↓ ${t.label}：${t.now}（基线 ${t.base.toFixed(1)}）`),
    ...(st.busiest.length ? [`- 本周量最大：${st.busiest.map((t) => `${t.label} ${t.now}`).join("、")}`] : []),
    "",
    "## 被提到的实验室（买方，不含它们自己的招聘页）",
    ...(st.buyers.length ? st.buyers.slice(0, 10).map((b) => `- ${b.name}：${b.now}（前期 ${b.prev}）`) : ["- 暂无"]),
    "",
    "## 被提到的数据商 / 环境公司",
    ...(st.vendors.length ? st.vendors.slice(0, 10).map((b) => `- ${b.name}：${b.now}（前期 ${b.prev}）`) : ["- 暂无"]),
    "",
    "## 招聘页",
    ...(st.boards.length
      ? st.boards.map((b) => `- ${b.org}（${b.org_type === "lab" ? "实验室" : b.org_type === "vendor" ? "数据商" : b.org_type || "其他"}）：在招 ${b.open}${b.expert ? `，专家岗 ${b.expert}` : ""}；7 天新增 ${b.opened7}、下架 ${b.closed7}${b.median_hr ? `；时薪中位数 $${b.median_hr}` : ""}`)
      : ["- 还没有招聘页数据"]),
    "",
    "## 岗位 / 页面变化",
    ...(st.changes.length
      ? st.changes.slice(0, 30).map((c) => `- ${({ opened: "新增", closed: "下架", pay_changed: "薪资变化", reopened: "重新开放", page_changed: "页面更新" } as Record<string, string>)[c.type] ?? c.type} · ${c.org || c.source_name}：${c.type === "pay_changed" ? c.detail : c.title ?? c.detail}${c.signal_id ? ` [#${c.signal_id}]` : ""}`)
      : ["- 本期没有变化"]),
    "",
    "## 信号（按重要度）",
    ...(st.signals.length ? st.signals.map(signalLine) : ["- 本期没有相关信号"]),
  ];
  return lines.join("\n") + (extra ? `\n\n${extra}` : "");
}

/** Readable brief without AI: the statistics written out. */
function statsMarkdown(st: BriefStats) {
  const o = st.ov;
  const out = [
    "## 本周概况",
    `- 新的相关信号 **${o.newSignals}** 条（${pct(o.newSignals, o.newSignalsPrev)}），其中明确需求 **${o.demand}** 条`,
    `- 在招岗位 **${o.openListings}**（专家 / 标注类 ${o.openExpert}），本周新增 ${o.opened}、下架 ${o.closed}${o.medianHourly ? `，时薪中位数 $${o.medianHourly}` : ""}`,
  ];
  if (st.rising.length) out.push("", "## 上升最快的方向", ...st.rising.slice(0, 6).map((t) => `- **${t.label}**：本周 ${t.now}，前 4 周平均 ${t.base.toFixed(1)}`));
  if (st.falling.length) out.push("", "## 在降温的方向", ...st.falling.map((t) => `- ${t.label}：本周 ${t.now}，前 4 周平均 ${t.base.toFixed(1)}`));
  if (st.buyers.length) out.push("", "## 被提到最多的实验室", `- ${st.buyers.slice(0, 8).map((b) => `${b.name} ${b.now}`).join(" · ")}`);
  const moved = st.boards.filter((b) => b.opened7 || b.closed7).slice(0, 8);
  if (moved.length) out.push("", "## 招聘页变化", ...moved.map((b) => `- ${b.org}：新增 ${b.opened7}、下架 ${b.closed7}，在招 ${b.open}`));
  const demand = st.signals.filter((s) => s.intent === "demand").slice(0, 6);
  if (demand.length) out.push("", "## 明确的需求", ...demand.map((s) => `- [#${s.id}] ${s.summary || s.title}`));
  const top = st.signals.filter((s) => s.intent !== "demand").slice(0, 8);
  if (top.length) out.push("", "## 值得看的信号", ...top.map((s) => `- [#${s.id}] ${s.summary || s.title}`));
  return out.join("\n");
}

export type Brief = { id: number; week: string; body: string; engine: string; created_at: string; sent_at: string | null; stats: Record<string, unknown> };

export async function generateBrief({ send = false, week = weekOf() } = {}): Promise<Brief> {
  const st = await collectStats(7);
  let body = statsMarkdown(st);
  let engine = "stats";
  let aiError = "";
  if (aiEnabled()) {
    try {
      const focus = await getSetting("brief_focus", "");
      body = await writeBriefWithAI(`${focus ? `我们公司的重点：${focus}\n\n` : ""}${contextText(st)}`);
      engine = "ai";
    } catch (e) {
      aiError = (e as Error).message;
    }
  }
  const stats = {
    newSignals: st.ov.newSignals, demand: st.ov.demand, openListings: st.ov.openListings, opened: st.ov.opened, closed: st.ov.closed,
    medianHourly: st.ov.medianHourly, rising: st.rising.map((t) => ({ key: t.key, label: t.label, now: t.now, base: t.base })),
    aiError: aiError || undefined,
  };
  const row = await one<Brief>(
    `insert into rd_briefs (week, stats, body, engine) values ($1, $2, $3, $4)
     on conflict (week) do update set stats = excluded.stats, body = excluded.body, engine = excluded.engine, created_at = now()
     returning id, week, body, engine, created_at, sent_at, stats`,
    [week, JSON.stringify(stats), body, engine],
  );
  if (send) await sendBrief(row!);
  return row!;
}

export async function sendBrief(b: Brief) {
  const md = b.body.replace(/^#{1,4} (.+)$/gm, "**$1**").slice(0, 3500);
  const sent = await notifyQuiet(`需求雷达 · ${b.week} 周报`, md, "/brief");
  if (sent.length) await q("update rd_briefs set sent_at = now() where id = $1", [b.id]);
  return sent;
}
