import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { grams } from "@/lib/meta";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5";

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ timeout: 100_000, maxRetries: 0 });
  return _client;
}

/* ───────────── redaction ───────────── */

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:ant-|proj-|live_|test_)?[A-Za-z0-9_\-]{16,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_\-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /((?:password|passwd|pwd|secret|token|api[_-]?key|密码)\s*[:=：]\s*)(\S{4,})/gi,
  /\b1[3-9]\d{9}\b/g,
];

/** Masks credentials and phone numbers. Returns the cleaned text and whether anything was masked. */
export function redact(text: string): { text: string; masked: number } {
  let masked = 0;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, prefix?: string) => {
      masked++;
      if (typeof prefix === "string" && /[:=：]\s*$/.test(prefix)) return `${prefix}[已打码]`;
      return "[已打码]";
    });
  }
  return { text: out, masked };
}

/* ───────────── extraction ───────────── */

const ItemSchema = z.object({
  kind: z.enum(["decision", "task", "insight", "question"]),
  title: z.string().describe("一句话结论，≤40 字，直接写结论本身"),
  body: z.string().describe("一句话理由或补充，≤80 字；没有就留空"),
  alternatives: z.array(z.string()).describe("决策时考虑过但没选的方案；非决策留空数组"),
  quote: z.string().describe("支撑这条结论的原文片段，≤120 字"),
  assignee: z.string().describe("任务负责人的名字或邮箱；未提及留空"),
  due: z.string().describe("任务截止时间的原文说法，如「周五」；未提及留空"),
  due_date: z.string().describe("截止日期换算成 YYYY-MM-DD（以「今天」为基准）；未提及留空"),
  subtasks: z.array(z.string()).describe("任务的子步骤，最多 6 个；非任务留空数组"),
  sensitive: z.boolean().describe("是否包含财务数据、客户隐私、密钥等不宜全员公开的信息"),
});

const TaskUpdateSchema = z.object({
  task_id: z.number().int(),
  done_subtasks: z.array(z.string()).describe("本次对话中完成的子任务标题，必须与已有子任务标题一致"),
  status: z.enum(["", "doing", "blocked", "done"]).describe("任务新状态；没有变化留空"),
  note: z.string().describe("一句话最新进展，≤40 字"),
});

const DistillSchema = z.object({
  title: z.string().describe("这段对话的主题，≤20 字"),
  summary: z.string().describe("1–2 句话概括对话产出，≤100 字"),
  project: z.string().describe("最匹配的已有项目名称，必须原样来自项目列表；都不匹配留空"),
  items: z.array(ItemSchema).describe("值得团队知道的结论，通常 0–6 条，宁缺毋滥"),
  task_updates: z.array(TaskUpdateSchema).describe("对已有任务的进度更新；没有就留空数组"),
});

export type Distilled = z.infer<typeof DistillSchema>;
export type DistillContext = {
  author: string;
  projects: { name: string; description: string }[];
  openTasks: { id: number; title: string; subtasks: string[] }[];
  members: string[];
  known?: string[];
  today?: string;
};

const DISTILL_SYSTEM = `你是创业团队的"共识秘书"。团队成员会把他们和各种 AI（ChatGPT、Claude、DeepSeek、Gemini、Grok、Cursor 等）的对话交给你。
你的工作是只提炼出团队其他人需要知道的内容：
- decision（决策）：已经做出的选择，包括技术选型、产品方向、定价、分工等。只收录明确做出的决定，不收录仍在考虑的选项。
- task（任务）：有明确负责人或明确要做的事。
- insight（洞察）：调研得到的事实或数据，对团队有复用价值。
- question（待定问题）：需要团队讨论或需要某人拍板的问题。
要求：
- 用中文，简洁、具体，写结论本身，不写"讨论了…"。
- 闲聊、调试过程中的试错、纯代码细节不要收录。
- 对话作者是 {author}。如果任务没写负责人但明显是作者自己要做的，assignee 填作者。
- 如果对话推进了"进行中的任务"列表里的某个任务，写入 task_updates，并且不要再重复创建同一个任务。
- 已打码的内容（[已打码]）不要还原。`;

export async function distillWithAI(text: string, ctx: DistillContext): Promise<Distilled> {
  const projects = ctx.projects.length
    ? ctx.projects.map((p) => `- ${p.name}${p.description ? `：${p.description}` : ""}`).join("\n")
    : "（暂无项目）";
  const tasks = ctx.openTasks.length
    ? ctx.openTasks.map((t) => `- #${t.id} ${t.title}${t.subtasks.length ? `（子任务：${t.subtasks.join("；")}）` : ""}`).join("\n")
    : "（暂无）";
  const res = await client().messages.parse({
    model: MODEL(),
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(DistillSchema) },
    system: DISTILL_SYSTEM.replace("{author}", ctx.author),
    messages: [
      {
        role: "user",
        content: `今天是 ${ctx.today ?? new Date().toISOString().slice(0, 10)}。\n\n团队项目：\n${projects}\n\n团队成员：${ctx.members.join("、") || "（未知）"}\n\n作者进行中的任务：\n${tasks}${ctx.known?.length ? `\n\n这段对话之前已经同步过，下面是已经记录过的结论，不要重复提炼：\n${ctx.known.map((k) => `- ${k}`).join("\n")}` : ""}\n\n<conversation>\n${text}\n</conversation>`,
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`AI 提炼失败（${res.stop_reason}）`);
  return res.parsed_output;
}

/** Rule-based fallback when no API key is configured or the AI call fails. */
export function distillHeuristic(text: string, title?: string): Distilled {
  const raw = text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s>*#\-•\d.、)）]+/, "").replace(/^【[^】]{1,8}】/, "").trim())
    .filter((l) => l.length >= 6 && l.length <= 160);
  const tidy = (l: string) =>
    l.replace(/^(TODO|todo|Todo|待办|任务|决定|决策|结论|Decision|Action item)\s*[:：]\s*/, "").replace(/^(好的?|嗯|OK|ok|行|那|所以)[，,、\s]+/, "").trim();
  const lines = raw.map(tidy);
  const items: Distilled["items"] = [];
  const seen = new Set<string>();
  const push = (kind: Distilled["items"][number]["kind"], l: string) => {
    const key = l.slice(0, 30);
    if (seen.has(key) || items.length >= 8) return;
    seen.add(key);
    const assignee = kind === "task" ? (l.match(/^([\p{L}A-Za-z]{1,12}?)\s*(?:负责|来做|跟进)/u)?.[1] ?? "") : "";
    const due = kind === "task" ? (l.match(/(下?周[一二三四五六日天]|今天|明天|后天|月底|\d{1,2}月\d{1,2}[日号])/)?.[1] ?? "") : "";
    items.push({ kind, title: l.slice(0, 60), body: "", alternatives: [], quote: l, assignee, due, due_date: "", subtasks: [], sensitive: /\[已打码\]/.test(l) });
  };
  raw.forEach((r, i) => {
    const l = lines[i];
    if (/[?？]/.test(r) && /(是否|要不要|还是|should we|whether|还没定|待定)/i.test(r)) push("question", l.split(/(?<=[?？])/)[0]);
    else if (/(决定|决策|结论|确定|定下来|最终方案|选择了|采用|we decided|decision|let's go with|conclusion)/i.test(r)) push("decision", l);
    else if (/(TODO|待办|负责|需要完成|截止|下一步|要做|action item|next step|deadline)/i.test(r)) push("task", l);
  });
  const first = lines[0] ?? text.slice(0, 80);
  const short = first.split(/[。？?！!；;\n]/)[0].slice(0, 40);
  return {
    title: title || short,
    summary: first.slice(0, 100),
    project: "",
    items,
    task_updates: [],
  };
}

/* ───────────── conflicts / duplicates ───────────── */

const RelationSchema = z.object({
  relations: z.array(
    z.object({
      new_id: z.number().int(),
      existing_id: z.number().int(),
      type: z.enum(["conflict", "duplicate"]),
      reason: z.string().describe("一句话说明，≤40 字"),
    }),
  ),
});

type Brief = { id: number; kind: string; title: string; body: string; owner: string };

/**
 * Without a server-side model: tasks that say nearly the same thing are flagged as duplicates, and decisions about the
 * same subject whose numbers differ ($12 vs $15, 3 周 vs 5 周) are flagged as conflicts. Conservative on purpose.
 */
export function relationsHeuristic(fresh: Brief[], existing: Brief[]) {
  const out: { new_id: number; existing_id: number; type: "conflict" | "duplicate"; reason: string }[] = [];
  const nums = (s: string) => new Set(s.match(/\d+(?:\.\d+)?/g) ?? []);
  for (const f of fresh) {
    const fg = grams(`${f.title}`);
    if (fg.size < 3) continue;
    let best: { e: Brief; score: number } | null = null;
    for (const e of existing) {
      if (e.kind !== f.kind) continue;
      const eg = grams(`${e.title}`);
      if (eg.size < 3) continue;
      let inter = 0;
      for (const g of fg) if (eg.has(g)) inter++;
      const score = inter / Math.min(fg.size, eg.size);
      if (!best || score > best.score) best = { e, score };
    }
    if (!best || best.score < 0.7) continue;
    if (f.kind === "task") out.push({ new_id: f.id, existing_id: best.e.id, type: "duplicate", reason: `和「${best.e.title.slice(0, 30)}」很像` });
    else if (f.kind === "decision") {
      const a = nums(f.title), b = nums(best.e.title);
      const differ = a.size > 0 && b.size > 0 && [...a].some((n) => !b.has(n));
      if (differ) out.push({ new_id: f.id, existing_id: best.e.id, type: "conflict", reason: "同一件事，数字不一致" });
    }
  }
  return out;
}

export async function findRelations(fresh: Brief[], existing: Brief[]) {
  if (!fresh.length || !existing.length) return [];
  if (!aiEnabled()) return relationsHeuristic(fresh, existing);
  const fmt = (b: Brief) => `#${b.id} [${b.kind}] ${b.title}${b.body ? `（${b.body}）` : ""} —— ${b.owner}`;
  try {
    const res = await client().messages.parse({
      model: MODEL(),
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(RelationSchema) },
      system:
        "判断新发布的条目是否与团队已有条目冲突或重复。conflict：两个决策对同一件事给出了不同答案。duplicate：两个任务或洞察在做同一件事。只报告有把握的关系，没有就返回空数组。",
      messages: [{ role: "user", content: `新条目：\n${fresh.map(fmt).join("\n")}\n\n已有条目：\n${existing.map(fmt).join("\n")}` }],
    });
    return res.parsed_output?.relations ?? [];
  } catch (e) {
    console.error("findRelations failed", e);
    return [];
  }
}

/* ───────────── ask ───────────── */

export async function askWithAI(question: string, context: string): Promise<string> {
  const res = await client().messages.create({
    model: MODEL(),
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system:
      "你是团队记忆助手。只根据给出的团队条目回答问题，用中文，简洁直接。引用条目时在句末写编号，如 [D-12]。条目里找不到答案就直说不知道，并建议去问谁。不要编造。",
    messages: [{ role: "user", content: `团队条目：\n${context}\n\n问题：${question}` }],
  });
  if (res.stop_reason === "refusal") return "这个问题暂时无法回答。";
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/* ───────────── outreach drafts ───────────── */

type DraftInput = { lang: "zh" | "en"; company: string; purpose: string; contact: string; history: string; next: string };

export function outreachPrompt(input: DraftInput) {
  const system =
    `你帮创业公司的创始人写一封跟进邮件。要求：${input.lang === "en" ? "用英文写。" : "用中文写。"}` +
    "第一行是「主题：…」（英文写 Subject: …），空一行后是正文。正文 80–160 字（英文 60–120 词），像创始人本人写的：具体、直接、有礼貌，" +
    "引用最近一次沟通里的具体内容，给出一个明确的下一步（时间或材料）。不要客套话堆砌，不要夸张形容词，不要编造数字或事实；没有的信息就不写。署名留「{我的名字}」。";
  const user = `公司背景：\n${input.company || "（未填写）"}\n\n目的：${input.purpose}\n\n对方：\n${input.contact}\n\n沟通记录（新的在前）：\n${input.history || "（还没有记录）"}\n\n计划的下一步：${input.next || "（未定）"}`;
  return { system, user };
}

export async function draftOutreachWithAI(input: DraftInput): Promise<string> {
  const { system, user } = outreachPrompt(input);
  const res = await client().messages.create({
    model: MODEL(),
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}
