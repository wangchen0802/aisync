import { currentUser } from "@/auth";
import { buildContext, type ContextScope } from "@/lib/core";
import { CORS, userFromRequest } from "@/lib/token";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Plain-text team context pack. Works with a browser session or a personal token (extension / scripts).
export async function GET(req: Request) {
  const me = (await userFromRequest(req)) ?? (await currentUser());
  if (!me) return new Response("unauthorized", { status: 401, headers: CORS });
  const sp = new URL(req.url).searchParams;
  const scope = (["team", "project", "me"].includes(sp.get("scope") ?? "") ? sp.get("scope") : "team") as ContextScope;
  const ctx = await buildContext(me.id, { scope, projectId: Number(sp.get("project")) || null, topic: sp.get("topic") ?? undefined, budget: Number(sp.get("budget")) || 6000 });
  return new Response(ctx.text, { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
}
