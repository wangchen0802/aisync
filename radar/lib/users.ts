import { randomBytes } from "node:crypto";
import { one, q } from "@/lib/db";

export type SessionUser = { id: number; email: string; name: string; image: string | null; role: string; api_token: string | null };

const COLS = "id, email, coalesce(name, split_part(email, '@', 1)) as name, image, role, api_token";
export const newToken = () => `rd_${randomBytes(18).toString("base64url")}`;

export async function userById(id: number) {
  return one<SessionUser>(`select ${COLS} from rd_users where id = $1`, [id]);
}

/** Resolves a personal API token (bookmarklet, MCP, context links). */
export async function userByToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || !token.startsWith("rd_") || token.length > 100) return null;
  return one<SessionUser>(`select ${COLS} from rd_users where api_token = $1`, [token]);
}

export async function ensureToken(userId: number) {
  const r = await one<{ api_token: string }>("update rd_users set api_token = coalesce(api_token, $2) where id = $1 returning api_token", [userId, newToken()]);
  return r!.api_token;
}

export async function resetToken(userId: number) {
  await q("update rd_users set api_token = $2 where id = $1", [userId, newToken()]);
}
