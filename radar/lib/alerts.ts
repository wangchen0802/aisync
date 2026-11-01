import "server-only";
import { getSetting, q } from "@/lib/db";
import { notifyQuiet } from "@/lib/notify";
import { fmtPay } from "@/lib/signals";
import { CHANNEL_META } from "@/lib/taxonomy";
import { clip } from "@/lib/text";

/** After a collection run: one message with high-relevance new signals and listing moves. */
export async function sendAlerts(since: Date) {
  if ((await getSetting("alerts", "on")) === "off") return { sent: 0 };
  const min = Number(await getSetting("alert_min_relevance", "75")) || 75;
  const hot = await q<{ id: number; channel: string; title: string; summary: string; org: string; pay_min: number | null; pay_max: number | null; pay_unit: string | null; intent: string }>(
    `select id, channel, title, summary, org, pay_min, pay_max, pay_unit, intent from rd_signals
     where first_seen_at >= $1 and not dismissed and relevance >= $2 and coalesce(published_at, first_seen_at) > now() - interval '10 days'
     order by (intent = 'demand') desc, relevance desc limit 8`,
    [since.toISOString(), min],
  );
  const [moves] = await q<{ opened: number; closed: number; pay: number }>(
    `select count(*) filter (where type = 'opened')::int as opened, count(*) filter (where type = 'closed')::int as closed,
       count(*) filter (where type = 'pay_changed')::int as pay from rd_changes where created_at >= $1`,
    [since.toISOString()],
  );
  if (!hot.length && !moves.opened && !moves.closed && !moves.pay) return { sent: 0 };
  const lines = hot.map((s) => {
    const pay = fmtPay(s.pay_min, s.pay_max, s.pay_unit);
    return `- ${s.intent === "demand" ? "🔥 " : ""}${CHANNEL_META[s.channel]?.label ?? s.channel}${s.org ? ` · ${s.org}` : ""}${pay ? ` · ${pay}` : ""}：${clip(s.summary || s.title, 90)}`;
  });
  if (moves.opened || moves.closed || moves.pay) lines.push(`- 岗位：新增 ${moves.opened}、下架 ${moves.closed}${moves.pay ? `、薪资变化 ${moves.pay}` : ""}`);
  const sent = await notifyQuiet(`需求雷达 · ${hot.length ? `${hot.length} 条高相关新信号` : "岗位有变化"}`, lines.join("\n"), "/signals?sort=new");
  return { sent: sent.length };
}
