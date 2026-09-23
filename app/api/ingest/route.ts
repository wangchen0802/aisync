import { z } from "zod";
import { ingestConversation } from "@/lib/core";
import { CORS, json, userFromRequest } from "@/lib/token";
import { SOURCES } from "@/lib/meta";

export const maxDuration = 60;

const Body = z.object({
  source: z.string().default("other"),
  title: z.string().max(300).optional(),
  url: z.string().max(2000).optional(),
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
    const r = await ingestConversation(user, { source, title: body.title, url: body.url, text: body.text, projectId: body.project_id ?? null });
    const origin = new URL(req.url).origin;
    return json({ ok: true, id: r.id, items: r.items, updates: r.updates, engine: r.engine, review_url: `${origin}/inbox?c=${r.id}` });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "导入失败" }, 500);
  }
}
