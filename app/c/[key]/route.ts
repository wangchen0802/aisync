import { buildContext, type ContextScope } from "@/lib/core";
import { one } from "@/lib/db";

// Read-only, plain-text team context for AIs that can open links (ChatGPT / Claude / Gemini with browsing).
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const u = key.startsWith("ctx_") ? await one<{ id: number }>("select id from users where context_key = $1", [key]) : null;
  if (!u) return new Response("链接无效或已失效。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const sp = new URL(req.url).searchParams;
  const scope = (["team", "project", "me"].includes(sp.get("scope") ?? "") ? sp.get("scope") : "team") as ContextScope;
  const ctx = await buildContext(u.id, {
    scope,
    projectId: Number(sp.get("project")) || null,
    topic: sp.get("topic") ?? undefined,
    budget: Math.min(20000, Math.max(1000, Number(sp.get("budget")) || 8000)),
  });
  return new Response(ctx.text, {
    headers: { "content-type": "text/markdown; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" },
  });
}
