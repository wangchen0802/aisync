import { userByToken } from "@/auth";
import { bearer, CORS, mcpPost } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
export const GET = () => new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });

export async function POST(req: Request) {
  return mcpPost(req, await userByToken(bearer(req)));
}
