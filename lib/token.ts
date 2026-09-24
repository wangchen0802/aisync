import "server-only";
import { one } from "@/lib/db";
import type { Actor } from "@/lib/core";

export async function userFromRequest(req: Request): Promise<Actor | null> {
  const h = req.headers.get("authorization") ?? "";
  return userFromToken(h.replace(/^Bearer\s+/i, "").trim());
}

export async function userFromToken(token: string): Promise<Actor | null> {
  if (!token.startsWith("sr_") || token.length > 100) return null;
  const u = await one<{ id: number; name: string | null; email: string; role: string }>(
    "select id, name, email, role from users where api_token = $1",
    [token],
  );
  return u ? { id: u.id, name: u.name || u.email.split("@")[0], email: u.email, role: u.role } : null;
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-max-age": "86400",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });
}
