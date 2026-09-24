import { z } from "zod";
import { ingestConversation } from "@/lib/core";
import { CORS, json, userFromRequest } from "@/lib/token";
import { SOURCES } from "@/lib/meta";

export const maxDuration = 120;

const Body = z.object({
  source: z.string().default("other"),
  title: z.string().max(300).optional(),
  url: z.string().max(2000).optional(),
  external_key: z.string().max(300).optional(),
  text: z.string().min(20).max(1_000_000),
  project_id: z.number().int().optional(),
});

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return json({ error: "个人密钥无效。请在 SimReal →「连接 AI」页面复制最新的密钥。" }, 401);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ error: "请求格式不正确：需要 text（至少 20 个字符）" }, 400);
  }
  const source = body.source in SOURCES ? body.source : "other";
  try {
    const r = await ingestConversation(user, { source, title: body.title, url: body.url, externalKey: body.external_key, text: body.text, projectId: body.project_id ?? null });
    const origin = new URL(req.url).origin;
    const pending = r.items + r.updates - r.published;
    return json({
      ok: true, id: r.id, items: r.items, updates: r.updates, engine: r.engine, unchanged: Boolean(r.unchanged),
      auto: r.auto, published: r.published, pending: Math.max(0, pending),
      review_url: `${origin}/inbox?c=${r.id}`, team_url: `${origin}/activity`,
      message: r.unchanged ? "这段对话没有新内容" : r.auto ? `已自动发布 ${r.published} 条${pending > 0 ? `，${pending} 条敏感内容待你审核` : ""}` : `提炼出 ${r.items} 条${r.updates ? `、${r.updates} 个任务进度` : ""}，等你审核`,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "导入失败" }, 500);
  }
}
