import { currentUser } from "@/auth";
import { contextPack } from "@/lib/core";
import { CORS, userFromRequest } from "@/lib/token";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Plain-text team context pack. Works with a browser session or a personal token (extension / scripts).
export async function GET(req: Request) {
  const me = (await userFromRequest(req)) ?? (await currentUser());
  if (!me) return new Response("unauthorized", { status: 401, headers: CORS });
  const p = Number(new URL(req.url).searchParams.get("project")) || null;
  return new Response(await contextPack(me.id, p), { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
}
