import { currentUser, userByToken } from "@/auth";
import { ANALYZE_PROMPT } from "@/lib/ai";
import { collectStats, contextText } from "@/lib/brief";
import { bearer, CORS } from "@/lib/mcp";

export const dynamic = "force-dynamic";

/** Plain-text context pack (stats + top signals) for pasting into any AI. Token or session. */
export async function GET(req: Request) {
  const me = (await userByToken(bearer(req) || new URL(req.url).searchParams.get("token"))) ?? (await currentUser());
  if (!me) return new Response("unauthorized", { status: 401, headers: CORS });
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
  const text = `${ANALYZE_PROMPT}\n\n${contextText(await collectStats(days))}`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
}
