import { mcpGet, mcpOptions, mcpPost } from "@/lib/mcp-server";
import { userFromRequest } from "@/lib/token";

export const maxDuration = 120;

export const OPTIONS = mcpOptions;
export const GET = mcpGet;

export async function POST(req: Request) {
  return mcpPost(req, await userFromRequest(req));
}
