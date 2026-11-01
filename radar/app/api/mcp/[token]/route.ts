import { userByToken } from "@/auth";
import { CORS, mcpPost } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
export const GET = () => new Response("Method Not Allowed", { status: 405, headers: { allow: "POST", ...CORS } });

/** Connector URL for Claude.ai / ChatGPT custom connectors (they can't send headers): the personal key is in the path. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return mcpPost(req, await userByToken((await params).token));
}
