import { aiEnabled } from "@/lib/ai";
import { buildDistillPrompt } from "@/lib/selfdistill";
import { CORS, json, userFromRequest } from "@/lib/token";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** The extraction prompt for the user's own AI. `server_ai` tells clients whether the server could do it instead. */
export async function GET(req: Request) {
  const me = await userFromRequest(req);
  if (!me) return json({ error: "个人密钥无效" }, 401);
  const url = new URL(req.url).searchParams.get("url");
  let key: string | null = null;
  if (url) {
    try {
      const u = new URL(url);
      key = `${u.host}${u.pathname}`.replace(/\/+$/, "").slice(0, 300);
    } catch { /* ignore */ }
  }
  return json({ server_ai: aiEnabled(), prompt: await buildDistillPrompt(me, { externalKey: key }) });
}
