import "server-only";
import { randomBytes } from "node:crypto";
import { one } from "@/lib/db";

/** Returns the user's personal API token, creating one on first use. */
export async function ensureToken(userId: number): Promise<string> {
  const row = await one<{ api_token: string | null }>("select api_token from users where id = $1", [userId]);
  if (row?.api_token) return row.api_token;
  const token = `sr_${randomBytes(24).toString("base64url")}`;
  await one("update users set api_token = $2 where id = $1 and api_token is null", [userId, token]);
  return (await one<{ api_token: string }>("select api_token from users where id = $1", [userId]))!.api_token;
}

/** Read-only key for the plain-text context link (/c/<key>). Separate from the write-capable API token. */
export async function ensureContextKey(userId: number): Promise<string> {
  const row = await one<{ context_key: string | null }>("select context_key from users where id = $1", [userId]);
  if (row?.context_key) return row.context_key;
  const key = `ctx_${randomBytes(18).toString("base64url")}`;
  await one("update users set context_key = $2 where id = $1 and context_key is null", [userId, key]);
  return (await one<{ context_key: string }>("select context_key from users where id = $1", [userId]))!.context_key;
}
