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

export type Kind = "decision" | "task" | "insight" | "question";
export const KIND_LABEL: Record<Kind, string> = { decision: "决策", task: "任务", insight: "洞察", question: "待定问题" };
export const KIND_PREFIX: Record<string, string> = { decision: "D", task: "T", insight: "I", question: "Q", update: "U" };

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
