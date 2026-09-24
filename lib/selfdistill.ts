import "server-only";
import { q } from "@/lib/db";
import type { Actor } from "@/lib/core";
import type { Distilled } from "@/lib/ai";
import { parseDue, todayISO, type Subtask } from "@/lib/meta";

/**
 * "Bring your own AI": the user's own ChatGPT / Claude / DeepSeek (subscription, no API key) does the extraction.
 * We hand it a prompt; it replies with a JSON block that we parse deterministically.
 */
export const START = "【SimReal 同步指令】";
export const END = "【SimReal 指令结束】";
export const MARKER = '"simreal_sync"';

export async function buildDistillPrompt(me: Actor, opts: { externalKey?: string | null } = {}) {
  const [projects, members, tasks] = await Promise.all([
    q<{ name: string }>("select name from projects where not archived order by created_at"),
    q<{ name: string; invited: boolean }>("select coalesce(name, email) as name, invited from users order by created_at"),
    q<{ id: number; title: string; subtasks: Subtask[] }>(
      `select id, title, subtasks from items where kind = 'task' and visibility <> 'draft' and status <> 'done' and (assignee_id = $1 or owner_id = $1) order by updated_at desc limit 20`,
      [me.id],
    ),
  ]);
  const known = opts.externalKey
    ? (await q<{ title: string }>(
        "select i.title from items i join conversations c on c.id = i.conversation_id where c.user_id = $1 and c.external_key = $2 limit 40",
        [me.id, opts.externalKey],
      )).map((r) => r.title)
    : [];
  const lines = [
    START,
    "把上面这段对话里团队其他人需要知道的内容整理出来。只回复一个 JSON 代码块，不要写别的。",
    "- decision：已经做出的决定（还在考虑的不算）",
    "- task：要做的事，写上负责人和截止日期",
    "- insight：调研得到、对团队有复用价值的事实或数据",
    "- question：需要团队讨论或有人拍板的问题",
    "宁缺毋滥，通常 0–6 条。闲聊、调试过程、代码细节不要。标题写结论本身，不写「讨论了…」。密钥、手机号等敏感信息不要写。",
    `今天是 ${todayISO()}，我是 ${me.name}。团队成员：${members.filter((m) => !m.invited).map((m) => m.name).join("、") || "（未知）"}。`,
    projects.length ? `项目（project 字段只能从这里选，都不像就留空）：${projects.map((p) => p.name).join("、")}` : "",
    tasks.length
      ? `我进行中的任务（对话推进了哪个，就写进 task_updates，不要重复建任务）：\n${tasks.map((t) => `#${t.id} ${t.title}${t.subtasks.length ? `（子任务：${t.subtasks.map((s) => s.title).join("；")}）` : ""}`).join("\n")}`
      : "",
    known.length ? `这段对话之前已经同步过这些，不要重复：\n${known.map((k) => `- ${k}`).join("\n")}` : "",
    "格式：",
    '{"simreal_sync":"v1","title":"对话主题，≤20 字","summary":"1–2 句话","project":"",' +
      '"items":[{"kind":"decision","title":"一句话结论","body":"一句话理由，可空","assignee":"负责人，可空","due_date":"YYYY-MM-DD，可空","subtasks":[]}],' +
      '"task_updates":[{"task_id":0,"status":"doing","note":"一句话进展","done_subtasks":[]}]}',
    END,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Pulls the balanced JSON object that contains `"simreal_sync"` out of arbitrary pasted text. */
function sliceJson(text: string, from: number): string | null {
  const at = text.indexOf(MARKER, from);
  if (at < 0) return null;
  const start = text.lastIndexOf("{", at);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Normalises whatever the model produced into our Distilled shape; unknown kinds and empty titles are dropped. */
export function normalizeDistilled(raw: unknown): Distilled | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const today = todayISO();
  const items = arr(o.items)
    .map((x) => x as Record<string, unknown>)
    .filter((x) => ["decision", "task", "insight", "question"].includes(String(x?.kind)) && str(x.title, 200))
    .slice(0, 12)
    .map((x) => {
      const dueRaw = str(x.due_date, 40) || str(x.due, 40);
      const due = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : parseDue(dueRaw, today) ?? "";
      return {
        kind: x.kind as Distilled["items"][number]["kind"],
        title: str(x.title, 200),
        body: str(x.body, 500),
        alternatives: arr(x.alternatives).map((a) => str(a, 120)).filter(Boolean),
        quote: str(x.quote, 240),
        assignee: str(x.assignee, 60),
        due: /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? "" : dueRaw,
        due_date: due,
        subtasks: arr(x.subtasks).map((a) => str(a, 120)).filter(Boolean).slice(0, 8),
        sensitive: x.sensitive === true,
      };
    });
  const updates = arr(o.task_updates)
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      task_id: Number(String(x?.task_id ?? "").replace(/^[#T-]+/i, "")),
      done_subtasks: arr(x.done_subtasks).map((a) => str(a, 120)).filter(Boolean),
      status: (["doing", "blocked", "done"].includes(String(x.status)) ? x.status : "") as Distilled["task_updates"][number]["status"],
      note: str(x.note, 200),
    }))
    .filter((u) => Number.isInteger(u.task_id) && u.task_id > 0);
  return { title: str(o.title, 60), summary: str(o.summary, 300), project: str(o.project, 80), items, task_updates: updates };
}

/**
 * If `text` contains a self-distilled JSON block (after our prompt, or on its own), returns it together with the
 * conversation that preceded the prompt. Otherwise null.
 */
export function extractSelfDistilled(text: string): { distilled: Distilled; conversation: string } | null {
  if (!text.includes(MARKER)) return null;
  const endAt = text.lastIndexOf(END);
  const json = sliceJson(text, endAt >= 0 ? endAt + END.length : 0);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const distilled = normalizeDistilled(parsed);
  if (!distilled) return null;
  const startAt = text.lastIndexOf(START);
  const conversation = (startAt >= 0 ? text.slice(0, startAt) : text.replace(json, "")).trim();
  return { distilled, conversation };
}
