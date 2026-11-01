import { userByToken } from "@/auth";
import { capture } from "@/lib/capture";
import { bearer, CORS, json } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

/** POST { url?, title?, text?, intent?, note?, org? } with `Authorization: Bearer rd_…` (scripts, shortcuts, other tools). */
export async function POST(req: Request) {
  const me = await userByToken(bearer(req));
  if (!me) return json({ error: "unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  try {
    const r = await capture(me.id, {
      url: String(body.url ?? ""), title: String(body.title ?? ""), text: String(body.text ?? ""),
      intent: String(body.intent ?? ""), note: String(body.note ?? ""), org: String(body.org ?? ""),
    });
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}
