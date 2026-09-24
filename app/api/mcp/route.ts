import { buildContext, contextPack, createItem, getItem, ingestConversation, itemLine, listProjects, logEvent, moveTask, search, type Actor } from "@/lib/core";
import { one, q } from "@/lib/db";
import { CORS, json, userFromRequest } from "@/lib/token";
import { parseDue, TASK_STATUS, todayISO, type Subtask } from "@/lib/meta";
import { activeRound, canSee, contactLine, findContact, followUps, listContacts, logTouch, roundStats, saveContact, visiblePipelines } from "@/lib/outreach";
import { fmtMoney, pipelineOf, stagesOf, type Pipeline } from "@/lib/outreach-meta";

// Minimal stateless MCP server (Streamable HTTP, JSON responses) exposing the team memory.
export const maxDuration = 120;

const TOOLS = [
  {
    name: "search_team_memory",
    description: "搜索团队的共识（决策）、任务、洞察和待定问题。在做技术选型、产品决策或开始一项任务之前先调用，确认团队是否已有结论。",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "关键词或问题" } }, required: ["query"] },
  },
  {
    name: "get_team_context",
    description: "获取团队上下文：团队档案、本周目标、已确认的共识、进行中的任务与 DDL、待定问题。开始新任务或新对话时先调用。传入 topic 会把与该话题相关的条目排在最前面。",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "项目名称，可选" },
        topic: { type: "string", description: "当前讨论的话题，可选，例如「定价」「支付」" },
      },
    },
  },
  {
    name: "get_my_work",
    description: "获取当前用户自己的工作：负责的任务（按 DDL 排序）、本周个人目标、等我确认的决策、我的想法。",
    inputSchema: { type: "object", properties: {} },
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
    name: "get_pipeline",
    description: "查看融资 / 客户 / 合作 / 招聘管道：每个联系人的阶段、金额、负责人、下一步、最近联系时间，以及本轮融资进度。写投资人更新、准备会议、安排跟进前调用。",
    inputSchema: {
      type: "object",
      properties: {
        pipeline: { type: "string", enum: ["investor", "customer", "partner", "talent"], description: "默认 investor（融资）" },
        only_follow_up: { type: "boolean", description: "只返回需要跟进的（到期或 14 天没联系）" },
        query: { type: "string", description: "按机构或人名筛选，可选" },
      },
    },
  },
  {
    name: "log_outreach",
    description: "记录一次和投资人、客户、合作方或候选人的沟通（邮件、会议、电话、消息），并更新下一步和跟进日期；也可以推进阶段。找不到这个人时会新建。",
    inputSchema: {
      type: "object",
      properties: {
        who: { type: "string", description: "机构名或人名，例如「红杉」「张三」" },
        note: { type: "string", description: "这次沟通的要点" },
        kind: { type: "string", enum: ["email", "meeting", "call", "message", "note"] },
        next_step: { type: "string", description: "下一步，例如「周五前发数据室」" },
        next_date: { type: "string", description: "跟进日期，YYYY-MM-DD 或「周五」「下周三」" },
        stage: { type: "string", description: "新阶段，可用中文，如「已见面」「尽调」「谈条款」「已承诺」" },
        pipeline: { type: "string", enum: ["investor", "customer", "partner", "talent"], description: "新建时使用，默认 investor" },
        amount: { type: "string", description: "金额，如 500k / 300万，可选" },
      },
      required: ["who"],
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
      return hits.length ? hits.map((i) => itemLine(i)).join("\n") : "没有找到相关的团队记录。";
    }
    case "get_team_context":
      return contextPack(me.id, await projectId(a.project as string | undefined), a.topic ? String(a.topic) : undefined);
    case "get_my_work":
      return (await buildContext(me.id, { scope: "me", budget: 5000 })).text;
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
      if (!task || task.kind !== "task" || (task.visibility !== "team" && task.owner_id !== me.id)) return `找不到任务 ${a.task_id}`;
      if (a.status && a.status !== task.status) await moveTask(me, id, String(a.status));
      const done = new Set(Array.isArray(a.done_subtasks) ? a.done_subtasks.map((s) => String(s).trim()) : []);
      const subs: Subtask[] = task.subtasks.map((s) => (done.has(s.title.trim()) ? { ...s, done: true } : s));
      const note = a.note ? String(a.note) : null;
      await q(
        "update items set subtasks = $2, last_update = coalesce($3, last_update), last_update_at = now(), updated_at = now(), last_update_source = $4, status = case when status = 'todo' then 'doing' else status end where id = $1",
        [id, JSON.stringify(subs), note, src],
      );
      if (note) await logEvent(me.id, "task_progress", note, id);
      const t = await getItem(id);
      return `T-${id} 已更新（${TASK_STATUS[t!.status]}${t!.subtasks.length ? ` ${t!.subtasks.filter((s) => s.done).length}/${t!.subtasks.length}` : ""}）`;
    }
    case "get_pipeline": {
      const p = pipelineOf(a.pipeline as string).key;
      if (!(await canSee(me, p))) return "你没有查看融资管道的权限。";
      let cs = await listContacts(p);
      const qy = a.query ? String(a.query).toLowerCase() : "";
      if (qy) cs = cs.filter((c) => `${c.org} ${c.name}`.toLowerCase().includes(qy));
      if (a.only_follow_up) cs = followUps(cs).map((f) => f.c);
      const lines: string[] = [];
      if (p === "investor") {
        const r = await activeRound();
        const s = roundStats(await listContacts("investor"), r);
        const cur = r?.currency ?? "USD";
        lines.push(`# 融资${r ? `：${r.name}` : ""}`, `目标 ${fmtMoney(s.target, cur)} · 已到账 ${fmtMoney(s.closed, cur)} · 已承诺 ${fmtMoney(s.committed, cur)} · 谈条款 ${fmtMoney(s.termSheet, cur)} · 加权管道 ${fmtMoney(s.weighted, cur)}${r?.close_date ? ` · 目标关账 ${r.close_date}` : ""}`, "");
      }
      const order = stagesOf(p).map((x) => x.key);
      cs.sort((x, y) => order.indexOf(y.stage) - order.indexOf(x.stage));
      lines.push(...cs.slice(0, 80).map((c) => contactLine(c)));
      if (cs.length > 80) lines.push(`…还有 ${cs.length - 80} 个`);
      return lines.length ? lines.join("\n") : "管道里还没有联系人。";
    }
    case "log_outreach": {
      const pipes = await visiblePipelines(me);
      const want = a.pipeline ? pipelineOf(String(a.pipeline)).key : undefined;
      let c = await findContact(me, String(a.who ?? ""), want);
      const pipeline: Pipeline = c?.pipeline ?? want ?? "investor";
      if (!pipes.includes(pipeline)) return "你没有权限记录融资沟通。";
      const stage = a.stage ? stagesOf(pipeline).find((x) => x.key === a.stage || x.label === String(a.stage).trim())?.key : undefined;
      const nextDate = a.next_date ? (/^\d{4}-\d{2}-\d{2}$/.test(String(a.next_date)) ? String(a.next_date) : parseDue(String(a.next_date), todayISO())) : undefined;
      let created = false;
      if (!c) {
        const id = await saveContact(me, { pipeline, org: String(a.who), name: "", stage: stage ?? "contacted", amount: a.amount ? String(a.amount) : null });
        c = (await listContacts(pipeline)).find((x) => x.id === id) ?? null;
        created = true;
      }
      if (!c) return "记录失败";
      await logTouch(me, c.id, {
        kind: String(a.kind ?? "note"), body: String(a.note ?? ""),
        nextStep: a.next_step !== undefined ? String(a.next_step) : undefined, nextDate: nextDate === undefined ? undefined : nextDate,
        stage: created ? undefined : stage,
      }).catch((e) => { if (!created) throw e; });
      return `${created ? "已新建并记录" : "已记录"}：${c.org || c.name}${stage ? ` → ${stagesOf(pipeline).find((x) => x.key === stage)?.label}` : ""}${nextDate ? `，${nextDate} 跟进` : ""}。${origin}/outreach/${c.id}`;
    }
    case "sync_conversation": {
      const r = await ingestConversation(me, { source: src, title: a.title ? String(a.title) : undefined, text: String(a.text ?? "") });
      return r.unchanged ? "没有新内容需要同步。" : r.auto ? `已自动发布 ${r.published} 条到团队：${origin}/activity` : `已发送到收件箱（提炼出 ${r.items} 条，${r.updates} 个任务进度），请在这里审核发布：${origin}/inbox?c=${r.id}`;
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
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "simreal-sync", version: "0.1.0" },
        instructions: "SimReal 是团队的共享记忆。开始任务前先调用 get_team_context（带上 topic）了解团队档案、本周目标和已确认的共识；拿不准时用 search_team_memory 查。做出决策后用 log_decision 记录，推进任务后用 update_task 更新进度。和投资人、客户、候选人沟通后用 log_outreach 记录，需要了解融资进度时用 get_pipeline。建议不要与「已确认的共识」冲突，冲突时要明确指出编号。",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "resources/list": {
      const ps = await listProjects();
      return ok({
        resources: [
          { uri: "simreal://context/team", name: "团队上下文", description: "团队档案、本周目标、共识、任务与 DDL", mimeType: "text/markdown" },
          { uri: "simreal://context/me", name: "我的工作", description: "我负责的任务、个人目标、等我确认的决策、我的想法", mimeType: "text/markdown" },
          ...ps.map((p) => ({ uri: `simreal://context/project/${p.id}`, name: `项目：${p.name}`, description: p.description || "项目背景与进展", mimeType: "text/markdown" })),
        ],
      });
    }
    case "resources/read": {
      const uri = String(msg.params?.uri ?? "");
      const m = uri.match(/^simreal:\/\/context\/(team|me|project\/(\d+))$/);
      if (!m) return err(-32602, `Unknown resource: ${uri}`);
      const ctx = m[1] === "me" ? await buildContext(me.id, { scope: "me" }) : m[2] ? await buildContext(me.id, { projectId: Number(m[2]) }) : await buildContext(me.id);
      return ok({ contents: [{ uri, mimeType: "text/markdown", text: ctx.text }] });
    }
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
