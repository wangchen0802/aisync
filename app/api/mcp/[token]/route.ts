import { mcpGet, mcpOptions, mcpPost } from "@/lib/mcp-server";
import { userFromToken } from "@/lib/token";

export const maxDuration = 120;

export const OPTIONS = mcpOptions;
export const GET = mcpGet;

/**
 * Connector URL for Claude.ai / ChatGPT custom connectors, which can't send an Authorization header:
 * the personal key is the last path segment. Resetting the key in SimReal revokes the URL.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return mcpPost(req, await userFromToken((await params).token));
}
