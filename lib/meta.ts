// Shared constants and pure helpers (safe for client and server).

export type SourceKey =
  | "chatgpt" | "claude" | "deepseek" | "gemini" | "grok" | "perplexity" | "kimi" | "doubao" | "qwen"
  | "claudecode" | "cursor" | "copilot" | "manual" | "other";

export const SOURCES: Record<SourceKey, { name: string; color: string; abbr: string; how: string; hosts?: string[] }> = {
  chatgpt: { name: "ChatGPT", color: "#10A37F", abbr: "GP", how: "浏览器插件", hosts: ["chatgpt.com", "chat.openai.com"] },
  claude: { name: "Claude", color: "#D97757", abbr: "Cl", how: "浏览器插件", hosts: ["claude.ai"] },
  deepseek: { name: "DeepSeek", color: "#4D6BFE", abbr: "DS", how: "浏览器插件", hosts: ["chat.deepseek.com"] },
  gemini: { name: "Gemini", color: "#1A73E8", abbr: "Ge", how: "浏览器插件", hosts: ["gemini.google.com"] },
  grok: { name: "Grok", color: "#27272A", abbr: "Gk", how: "浏览器插件", hosts: ["grok.com", "x.com"] },
  perplexity: { name: "Perplexity", color: "#20808D", abbr: "Px", how: "浏览器插件", hosts: ["www.perplexity.ai", "perplexity.ai"] },
  kimi: { name: "Kimi", color: "#3F3F46", abbr: "Ki", how: "浏览器插件", hosts: ["kimi.moonshot.cn", "www.kimi.com", "kimi.com"] },
  doubao: { name: "豆包", color: "#3C5CFF", abbr: "豆", how: "浏览器插件", hosts: ["www.doubao.com"] },
  qwen: { name: "通义千问", color: "#615CED", abbr: "通", how: "浏览器插件", hosts: ["tongyi.aliyun.com", "www.tongyi.com", "chat.qwen.ai"] },
  claudecode: { name: "Claude Code", color: "#B8603F", abbr: "CC", how: "Hook + MCP" },
  cursor: { name: "Cursor", color: "#18181B", abbr: "Cu", how: "MCP" },
  copilot: { name: "Copilot", color: "#6E40C9", abbr: "Co", how: "粘贴导入" },
  manual: { name: "手动", color: "#71717A", abbr: "手", how: "手动创建" },
  other: { name: "其他", color: "#71717A", abbr: "AI", how: "粘贴导入" },
};

export function sourceOf(key: string | null | undefined) {
  return SOURCES[(key as SourceKey) in SOURCES ? (key as SourceKey) : "other"];
}

export type Kind = "decision" | "task" | "insight" | "question" | "idea";
export const KIND_LABEL: Record<Kind, string> = { decision: "决策", task: "任务", question: "待定问题", insight: "洞察", idea: "想法" };
export const KIND_PREFIX: Record<string, string> = { decision: "D", task: "T", insight: "I", question: "Q", idea: "N", update: "U" };

export const DECISION_STATUS: Record<string, string> = {
  discussing: "讨论中", confirmed: "已确认", conflict: "有冲突", superseded: "已推翻",
};
export const TASK_STATUS: Record<string, string> = { todo: "待开始", doing: "进行中", blocked: "阻塞", done: "已完成" };
export const TASK_COLUMNS = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_COLUMNS)[number];

export const PROJECT_COLORS = ["#3E63DD", "#D97706", "#12A594", "#E5484D", "#8E4EC6", "#0091FF", "#AD5700", "#30A46C"];

export function code(kind: string, id: number) {
  return `${KIND_PREFIX[kind] ?? "X"}-${id}`;
}

const AV_COLORS = ["#3E63DD", "#D97706", "#8E4EC6", "#E5484D", "#12A594", "#0091FF", "#18181B", "#AD5700"];
export function avatarColor(id: number | null | undefined) {
  return AV_COLORS[Math.abs(id ?? 0) % AV_COLORS.length];
}

export function ago(d: string | Date | null | undefined): string {
  if (!d) return "";
  const t = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(t.getTime())) return "";
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 172800) return "昨天";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} 天前`;
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}

export type Subtask = { title: string; done: boolean };

export function progressOf(status: string, subtasks: Subtask[]) {
  if (!subtasks.length) return { done: status === "done" ? 1 : 0, total: 1 };
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length };
}

/* ───────────── dates (team calendar runs on Beijing time) ───────────── */

export const TZ = "Asia/Shanghai";
const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function todayISO(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(a: string, b: string) {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 864e5);
}
export function weekday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
/** Monday of the week containing iso. */
export function weekStart(iso = todayISO()) {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}
export function fmtDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d} ${WEEKDAY[weekday(iso)]}`;
}
export function fmtDue(iso: string | null | undefined, today = todayISO()) {
  if (!iso) return "";
  const n = dayDiff(iso, today);
  if (n === 0) return "今天";
  if (n === 1) return "明天";
  if (n === -1) return "昨天";
  if (n < 0) return `逾期 ${-n} 天`;
  if (n < 7) return WEEKDAY[weekday(iso)];
  return fmtDay(iso);
}
export type DueTone = "overdue" | "today" | "soon" | "later";
export function dueTone(iso: string | null | undefined, status: string, today = todayISO()): DueTone | null {
  if (!iso || status === "done") return null;
  const n = dayDiff(iso, today);
  return n < 0 ? "overdue" : n === 0 ? "today" : n <= 2 ? "soon" : "later";
}

/** Turns "周五" / "下周三" / "明天" / "9月30日" / "2026-10-01" into an ISO date relative to base. */
export function parseDue(text: string | null | undefined, base = todayISO()): string | null {
  if (!text) return null;
  const t = text.trim();
  let m = t.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/(\d{1,2})\s*[月/.]\s*(\d{1,2})\s*[日号]?/);
  if (m) {
    const y = Number(base.slice(0, 4));
    let iso = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    if (dayDiff(iso, base) < -60) iso = `${y + 1}${iso.slice(4)}`;
    return iso;
  }
  if (/今天|今日|today/i.test(t)) return base;
  if (/明天|tomorrow/i.test(t)) return addDays(base, 1);
  if (/后天/.test(t)) return addDays(base, 2);
  if (/月底/.test(t)) {
    const d = new Date(`${base}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  }
  m = t.match(/(下下|下)?(?:周|星期|礼拜)([一二三四五六日天])/);
  if (m) {
    const target = "日一二三四五六".indexOf(m[2] === "天" ? "日" : m[2]);
    const mon = weekStart(base);
    const offset = target === 0 ? 6 : target - 1;
    let iso = addDays(mon, offset + (m[1] === "下下" ? 14 : m[1] === "下" ? 7 : 0));
    if (!m[1] && dayDiff(iso, base) < 0) iso = addDays(iso, 7);
    return iso;
  }
  if (/下周/.test(t)) return addDays(weekStart(base), 7 + 4);
  if (/本周|这周/.test(t)) return addDays(weekStart(base), 4);
  return null;
}

export function estimateTokens(text: string) {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  return Math.round(cjk * 1.1 + (text.length - cjk) / 3.8);
}
