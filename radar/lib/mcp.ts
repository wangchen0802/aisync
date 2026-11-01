import "server-only";
import type { SessionUser } from "@/lib/users";
import { collectStats, contextText } from "@/lib/brief";
import { capture } from "@/lib/capture";
import { one, q } from "@/lib/db";
import { fmtPay } from "@/lib/format";
import { listSignals } from "@/lib/signals";
import { CHANNEL_META, INTENT_LABEL } from "@/lib/taxonomy";
import { clip, oneLine } from "@/lib/text";
import { boards, recentChanges, topicTrends } from "@/lib/trends";

// Minimal stateless MCP server (Streamable HTTP, JSON responses), same shape as SimReal Sync's.

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-max-age": "86400",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
}

const TOOLS = [
  {
    name: "demand_report",
    description: "需求雷达的完整报告：概况、升温 / 降温的方向、被提到的实验室和数据商、招聘页变化、按重要度排序的信号（带编号 #id 和链接）。分析数据 / RL 环境需求时先调用这个。",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "统计最近多少天，默认 7" } } },
  },
  {
    name: "search_signals",
    description: "按条件搜索信号（岗位、X、Reddit、HN、论文、新闻、手动收录）。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "关键词，匹配标题 / 内容 / 公司" },
        topic: { type: "string", description: "主题 key，例如 rl_env、coding、computer_use、medical（见 topic_trends）" },
        intent: { type: "string", enum: Object.keys(INTENT_LABEL), description: "demand=明确需求，hiring=招人，supply=供给，release=开源发布，research=论文，news=新闻" },
        channel: { type: "string", enum: Object.keys(CHANNEL_META) },
        org: { type: "string", description: "公司名，例如 OpenAI、Scale AI" },
        days: { type: "number", description: "最近多少天，默认 30" },
        listings_only: { type: "boolean", description: "只看在招岗位" },
        limit: { type: "number", description: "默认 25，最多 80" },
      },
    },
  },
  {
    name: "topic_trends",
    description: "每个方向（数据形态 + 领域）最近 12 周的周信号数、本周 vs 前 4 周平均。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listing_changes",
    description: "招聘页变化：每家公司在招 / 专家岗 / 新增 / 下架 / 时薪中位数，以及具体的新增、下架、薪资变化记录。",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "默认 14" } } },
  },
  {
    name: "list_themes",
    description: "团队的需求假设（我们在验证的判断），包括状态、依据、证据数和下一步。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "capture_signal",
    description: "把一条需求信号收录进雷达（例如用户转述的客户询价、群聊消息、帖子）。会自动分类并标星。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "内容 / 要点" },
        title: { type: "string", description: "一句话：谁需要什么" },
        url: { type: "string" },
        intent: { type: "string", enum: Object.keys(INTENT_LABEL) },
        org: { type: "string", description: "相关公司" },
        note: { type: "string", description: "我们的判断 / 跟进人" },
      },
      required: ["text"],
    },
  },
  {
    name: "add_evidence",
    description: "把信号挂到某个需求假设上当证据；不传 theme_id 而传 new_theme_title 会新建一个假设。",
    inputSchema: {
      type: "object",
      properties: { signal_id: { type: "number" }, theme_id: { type: "number" }, new_theme_title: { type: "string" }, thesis: { type: "string" } },
      required: ["signal_id"],
    },
  },
];

const num = (v: unknown, d: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : d;
};

async function callTool(me: SessionUser, name: string, a: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "demand_report":
      return contextText(await collectStats(num(a.days, 7, 90)));
    case "search_signals": {
      const { rows, total } = await listSignals({
        q: a.query ? String(a.query) : undefined,
        topic: a.topic ? String(a.topic) : undefined,
        intent: a.intent ? String(a.intent) : undefined,
        channel: a.channel ? String(a.channel) : undefined,
        org: a.org ? String(a.org) : undefined,
        days: num(a.days, 30, 365),
        listing: a.listings_only ? "only" : "",
        sort: "relevance",
        limit: num(a.limit, 25, 80),
      });
      if (!rows.length) return "没有找到符合条件的信号。";
      return `共 ${total} 条，显示 ${rows.length} 条：\n\n` + rows.map((s) => {
        const pay = fmtPay(s.pay_min, s.pay_max, s.pay_unit);
        return `[#${s.id}] ${CHANNEL_META[s.channel]?.label ?? s.channel} · ${INTENT_LABEL[s.intent] ?? s.intent}${s.org ? ` · ${s.org}` : ""}${pay ? ` · ${pay}` : ""} · 相关度 ${s.relevance} · ${(s.published_at ?? s.first_seen_at).slice(0, 10)}\n${s.title}\n${clip(oneLine(s.summary || s.body), 260)}${s.url ? `\n${s.url}` : ""}`;
      }).join("\n\n");
    }
    case "topic_trends": {
      const t = (await topicTrends()).filter((x) => x.total > 0).sort((x, y) => y.score - x.score);
      if (!t.length) return "还没有趋势数据。";
      return "方向（key）：本周 / 前 4 周平均 / 近 12 周序列（旧→新）\n" + t.map((x) => `- ${x.label}（${x.key}，${x.grp === "format" ? "数据形态" : "领域"}）：${x.now} / ${x.base.toFixed(1)} / ${x.series.join(",")}`).join("\n");
    }
    case "listing_changes": {
      const days = num(a.days, 14, 90);
      const [bds, ch] = await Promise.all([boards(), recentChanges(60, ["opened", "closed", "pay_changed", "reopened"], days)]);
      const head = bds.map((b) => `- ${b.org}：在招 ${b.open}，专家岗 ${b.expert}，7 天 +${b.opened7} / −${b.closed7}${b.median_hr ? `，时薪中位数 $${b.median_hr}` : ""}`).join("\n");
      const lines = ch.map((c) => `- ${c.created_at.slice(0, 10)} ${({ opened: "新增", closed: "下架", pay_changed: "薪资", reopened: "重开" } as Record<string, string>)[c.type] ?? c.type} · ${c.org || c.source_name}：${c.type === "pay_changed" ? c.detail : c.title}${c.signal_id ? ` [#${c.signal_id}]` : ""}`).join("\n");
      return `## 招聘页\n${head || "（无）"}\n\n## 最近 ${days} 天的变化\n${lines || "（无）"}`;
    }
    case "list_themes": {
      const rows = await q<{ id: number; title: string; thesis: string; status: string; next_step: string; evidence: number }>(
        "select t.id, t.title, t.thesis, t.status, t.next_step, (select count(*)::int from rd_theme_signals s where s.theme_id = t.id) as evidence from rd_themes t order by t.updated_at desc limit 40",
      );
      if (!rows.length) return "还没有需求假设。";
      return rows.map((t) => `#${t.id} [${t.status}] ${t.title}（${t.evidence} 条证据）${t.thesis ? `\n  依据：${clip(oneLine(t.thesis), 200)}` : ""}${t.next_step ? `\n  下一步：${t.next_step}` : ""}`).join("\n");
    }
    case "capture_signal": {
      const r = await capture(me.id, { text: String(a.text ?? ""), title: String(a.title ?? ""), url: String(a.url ?? ""), intent: String(a.intent ?? ""), note: String(a.note ?? ""), org: String(a.org ?? "") });
      return r.existed ? `已存在，已更新 #${r.id}` : `已收录 #${r.id}`;
    }
    case "add_evidence": {
      const sid = Number(a.signal_id);
      if (!(await one("select 1 from rd_signals where id = $1", [sid]))) throw new Error(`信号 #${sid} 不存在`);
      let tid = Number(a.theme_id);
      if (!tid) {
        const title = String(a.new_theme_title ?? "").trim();
        if (!title) throw new Error("需要 theme_id 或 new_theme_title");
        tid = (await one<{ id: number }>("insert into rd_themes (title, thesis, owner_id) values ($1, $2, $3) returning id", [clip(title, 200), clip(String(a.thesis ?? ""), 4000), me.id]))!.id;
      } else if (!(await one("select 1 from rd_themes where id = $1", [tid]))) throw new Error(`假设 #${tid} 不存在`);
      await q("insert into rd_theme_signals (theme_id, signal_id, added_by) values ($1, $2, $3) on conflict do nothing", [tid, sid, me.id]);
      await q("update rd_themes set updated_at = now() where id = $1", [tid]);
      return `已把 #${sid} 加到假设 #${tid}`;
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(me: SessionUser, msg: Rpc) {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: (msg.params?.protocolVersion as string) || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "demand-radar", version: "0.1.0" },
        instructions:
          "需求雷达监控 AI 实验室对训练数据和 RL 环境的需求（数据商 / 实验室招聘页、X、Reddit、HN、arXiv、Hugging Face、GitHub、新闻、团队手动收录）。分析需求时先调用 demand_report，再用 search_signals / topic_trends / listing_changes 深挖；引用信号时写 [#编号]。用户转述客户询价或看到的需求时，用 capture_signal 收录。",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      try {
        const text = await callTool(me, String(msg.params?.name ?? ""), (msg.params?.arguments ?? {}) as Record<string, unknown>);
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

export async function mcpPost(req: Request, me: SessionUser | null) {
  if (!me) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: invalid radar token" } }, 401);
  let body: Rpc | Rpc[];
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(me, m)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(me, body);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}

export const bearer = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
