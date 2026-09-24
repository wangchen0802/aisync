// Shared (client + server) constants for the fundraising / outreach pipeline.

export type Pipeline = "investor" | "customer" | "partner" | "talent";

export const PIPELINES: { key: Pipeline; label: string; noun: string; amount: string | null }[] = [
  { key: "investor", label: "融资", noun: "投资人", amount: "预期金额" },
  { key: "customer", label: "客户", noun: "客户", amount: "合同额" },
  { key: "partner", label: "合作", noun: "合作方", amount: null },
  { key: "talent", label: "招聘", noun: "候选人", amount: null },
];

export const pipelineOf = (k: string | undefined | null) => PIPELINES.find((p) => p.key === k) ?? PIPELINES[0];

/** Ordered stages per pipeline. The last two are terminal: [won, lost]. `p` = probability used for the weighted pipeline. */
export const STAGES: Record<Pipeline, { key: string; label: string; p: number }[]> = {
  investor: [
    { key: "target", label: "待联系", p: 0.02 },
    { key: "contacted", label: "已联系", p: 0.05 },
    { key: "meeting", label: "已见面", p: 0.15 },
    { key: "diligence", label: "尽调", p: 0.35 },
    { key: "term_sheet", label: "谈条款", p: 0.65 },
    { key: "committed", label: "已承诺", p: 0.9 },
    { key: "closed", label: "已到账", p: 1 },
    { key: "passed", label: "放弃", p: 0 },
  ],
  customer: [
    { key: "target", label: "待联系", p: 0.02 },
    { key: "contacted", label: "已联系", p: 0.05 },
    { key: "replied", label: "已回复", p: 0.15 },
    { key: "meeting", label: "演示 / 试用", p: 0.35 },
    { key: "negotiating", label: "谈合同", p: 0.65 },
    { key: "won", label: "成交", p: 1 },
    { key: "lost", label: "未成", p: 0 },
  ],
  partner: [
    { key: "target", label: "待联系", p: 0 },
    { key: "contacted", label: "已联系", p: 0 },
    { key: "replied", label: "已回复", p: 0 },
    { key: "meeting", label: "已沟通", p: 0 },
    { key: "negotiating", label: "推进中", p: 0 },
    { key: "won", label: "达成合作", p: 0 },
    { key: "lost", label: "未成", p: 0 },
  ],
  talent: [
    { key: "target", label: "待联系", p: 0 },
    { key: "contacted", label: "已联系", p: 0 },
    { key: "replied", label: "有意向", p: 0 },
    { key: "meeting", label: "面试中", p: 0 },
    { key: "negotiating", label: "谈 offer", p: 0 },
    { key: "won", label: "已入职", p: 0 },
    { key: "lost", label: "未成", p: 0 },
  ],
};

export const stagesOf = (p: string) => STAGES[pipelineOf(p).key];
export const stageLabel = (p: string, s: string) => stagesOf(p).find((x) => x.key === s)?.label ?? s;
/** Stages that count as "in play" (not yet contacted, won or lost are excluded). */
export const isActive = (p: string, s: string) => {
  const st = stagesOf(p);
  const i = st.findIndex((x) => x.key === s);
  return i > 0 && i < st.length - 2;
};
export const isWon = (p: string, s: string) => {
  const st = stagesOf(p);
  return p === "investor" ? s === "committed" || s === "closed" : s === st[st.length - 2].key;
};
export const isLost = (p: string, s: string) => s === stagesOf(p)[stagesOf(p).length - 1].key;
export const nextStage = (p: string, s: string) => {
  const st = stagesOf(p);
  const i = st.findIndex((x) => x.key === s);
  return i >= 0 && i < st.length - 2 ? st[i + 1] : null;
};

export const HEAT: Record<string, { label: string; color: string }> = {
  hot: { label: "热", color: "var(--red)" },
  warm: { label: "温", color: "var(--amber)" },
  cold: { label: "冷", color: "var(--faint)" },
};

export const TOUCH_KINDS: [string, string][] = [["email", "邮件"], ["meeting", "会议"], ["call", "电话"], ["message", "消息"], ["note", "备注"]];
export const touchLabel = (k: string) => (k === "stage" ? "阶段" : TOUCH_KINDS.find(([x]) => x === k)?.[1] ?? k);

export const SOURCES_OUT: [string, string][] = [["", "未填"], ["intro", "引荐"], ["cold", "主动联系"], ["inbound", "对方找来"], ["event", "活动"]];

export const STALE_DAYS = 14;

export function fmtMoney(n: number | null | undefined, cur = "USD") {
  if (n == null || !isFinite(n)) return "—";
  const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, ""));
  if (cur === "CNY") {
    if (n >= 1e8) return `¥${trim(n / 1e8)}亿`;
    if (n >= 1e4) return `¥${trim(n / 1e4)}万`;
    return `¥${Math.round(n)}`;
  }
  const sym = cur === "EUR" ? "€" : "$";
  if (n >= 1e9) return `${sym}${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${sym}${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${sym}${trim(n / 1e3)}K`;
  return `${sym}${Math.round(n)}`;
}

/** "500k" · "1.2M" · "$2m" · "500万" · "2亿" · "250,000" → number. */
export function parseMoney(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.replace(/[,\s$¥€]/g, "").toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|b|w|万|亿)?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9, w: 1e4, 万: 1e4, 亿: 1e8 }[m[2] as "k"] ?? 1;
  return Number(m[1]) * mult;
}
