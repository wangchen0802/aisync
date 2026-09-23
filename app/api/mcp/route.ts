import { contextPack, createItem, getItem, ingestConversation, itemLine, listProjects, logEvent, moveTask, search, type Actor } from "@/lib/core";
import { one, q } from "@/lib/db";
import { CORS, json, userFromRequest } from "@/lib/token";
import { TASK_STATUS, type Subtask } from "@/lib/meta";

// Minimal stateless MCP server (Streamable HTTP, JSON responses) exposing the team memory.
export const maxDuration = 60;

const TOOLS = [
  {
    name: "search_team_memory",
    description: "搜索团队的共识（决策）、任务、洞察和待定问题。在做技术选型、产品决策或开始一项任务之前先调用，确认团队是否已有结论。",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "关键词或问题" } }, required: ["query"] },
  },
  {
    name: "get_team_context",
    description: "获取团队（或某个项目）的上下文：已确认的共识、进行中的任务、待定问题。开始新对话时调用。",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "项目名称，可选" } } },
  },
  {
    name: "log_decision",
    description: "把本次对话中做出的决策记录到团队共识（状态为「讨论中」，等待队友确认）。",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string", description: "一句话决策" }, reason: { type: "string", description: "一句话理由" }, project: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "create_task",
    description: "创建团队任务。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" }, project: { type: "string" }, assignee: { type: "string", description: "负责人名字或邮箱，默认自己" },
        due: { type: "string" }, subtasks: { type: "array", items: { type: "string" } },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "更新任务进度：状态、一句话进展、已完成的子任务。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "任务编号，如 T-12" },
        status: { type: "string", enum: ["todo", "doing", "blocked", "done"] },
        note: { type: "string", description: "一句话最新进展" },
        done_subtasks: { type: "array", items: { type: "string" } },
      },
      required: ["task_id"],
    },
  },
  {
    name: "sync_conversation",
    description: "把当前对话的要点发送到 SimReal 收件箱，由用户审核后发布给团队。text 应包含对话中的关键讨论与结论。",
    inputSchema: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["text"] },
  },
];

async function projectId(name?: string) {
  if (!name) return null;
  const ps = await listProjects();
  return ps.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? ps.find((p) => p.name.includes(name) || name.includes(p.name))?.id ?? null;
}

async function callTool(me: Actor, name: string, a: Record<string, unknown>, clientName: string, origin: string): Promise<string> {
  const src = /cursor/i.test(clientName) ? "cursor" : /claude/i.test(clientName) ? "claudecode" : "other";
  switch (name) {
    case "search_team_memory": {
      const hits = await search(me.id, String(a.query ?? ""), 12);
      return hits.length ? hits.map(itemLine).join("\n") : "没有找到相关的团队记录。";
    }
    case "get_team_context":
      return contextPack(me.id, await projectId(a.project as string | undefined));
    case "log_decision": {
      const id = await createItem(me, { kind: "decision", title: String(a.title), body: String(a.reason ?? ""), projectId: await projectId(a.project as string | undefined), source: src });
      return `已记录 D-${id}，等待队友确认：${origin}/consensus#D-${id}`;
    }
    case "create_task": {
      let assigneeId: number | null = null;
      if (a.assignee) {
        const n = String(a.assignee).toLowerCase();
        assigneeId = (await one<{ id: number }>("select id from users where lower(name) = $1 or lower(email) = $1 or lower(split_part(email,'@',1)) = $1", [n]))?.id ?? null;
      }
      const id = await createItem(me, {
        kind: "task", title: String(a.title), projectId: await projectId(a.project as string | undefined), assigneeId,
        due: a.due ? String(a.due) : undefined, subtasks: Array.isArray(a.subtasks) ? a.subtasks.map(String) : [], source: src,
      });
      return `已创建 T-${id}：${origin}/tasks#T-${id}`;
    }
    case "update_task": {
      const id = Number(String(a.task_id).replace(/^T-?/i, ""));
      const task = await getItem(id);
      if (!task || task.kind !== "task") return `找不到任务 ${a.task_id}`;
      if (a.status && a.status !== task.status) await moveTask(me, id, String(a.status));
      const done = new Set(Array.isArray(a.done_subtasks) ? a.done_subtasks.map((s) => String(s).trim()) : []);
      const subs: Subtask[] = task.subtasks.map((s) => (done.has(s.title.trim()) ? { ...s, done: true } : s));
      const note = a.note ? String(a.note) : null;
      await q(
        "update items set subtasks = $2, last_update = coalesce($3, last_update), last_update_at = now(), updated_at = now(), source = $4, status = case when status = 'todo' then 'doing' else status end where id = $1",
        [id, JSON.stringify(subs), note, src],
      );
      if (note) await logEvent(me.id, "task_progress", note, id);
      const t = await getItem(id);
      return `T-${id} 已更新（${TASK_STATUS[t!.status]}${t!.subtasks.length ? ` ${t!.subtasks.filter((s) => s.done).length}/${t!.subtasks.length}` : ""}）`;
    }
    case "sync_conversation": {
      const r = await ingestConversation(me, { source: src, title: a.title ? String(a.title) : undefined, text: String(a.text ?? "") });
      return `已发送到收件箱（提炼出 ${r.items} 条，${r.updates} 个任务进度），请在这里审核发布：${origin}/inbox?c=${r.id}`;
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(me: Actor, msg: Rpc, origin: string, clientName: { v: string }) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const info = msg.params?.clientInfo as { name?: string } | undefined;
      clientName.v = info?.name ?? "";
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "simreal-sync", version: "0.1.0" },
        instructions: "SimReal 团队记忆。开始任务前用 search_team_memory 或 get_team_context 了解团队已有共识；做出决策后用 log_decision 记录；推进任务后用 update_task 更新进度。",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = await callTool(me, name, args, clientName.v, origin);
        return ok({ content: [{ type: "text", text }] });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : "调用失败" }], isError: true });
      }
    }
    default:
      if (msg.method?.startsWith("notifications/")) return null;
      return err(-32601, `Method not found: ${msg.method}`);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });
}

export async function POST(req: Request) {
  const me = await userFromRequest(req);
  if (!me) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: invalid SimReal token" } }, 401);
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const origin = new URL(req.url).origin;
  const clientName = { v: req.headers.get("user-agent") ?? "" };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(me, m, origin, clientName)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(me, body, origin, clientName);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}
