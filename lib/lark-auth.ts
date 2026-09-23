import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { lark } from "@/lib/notify";

export type LarkIdentity = { email: string; name: string; image: string | null; openId: string };

const secret = () => process.env.AUTH_SECRET ?? "";

/** Short-lived signed ticket carrying a verified Lark identity from the OAuth callback into Auth.js. */
export function signTicket(id: LarkIdentity) {
  const payload = Buffer.from(JSON.stringify({ ...id, exp: Date.now() + 2 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyTicket(ticket: string): LarkIdentity | null {
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig || !secret()) return null;
  const expect = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as LarkIdentity & { exp: number };
  return data.exp > Date.now() ? { email: data.email, name: data.name, image: data.image, openId: data.openId } : null;
}

async function larkPost<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const res = await fetch(`${lark.domain()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return (await res.json()) as T;
}

/** Exchanges an OAuth code for the Lark user's profile. */
export async function larkIdentityFromCode(code: string): Promise<LarkIdentity> {
  const app = await larkPost<{ code: number; msg?: string; app_access_token?: string }>("/open-apis/auth/v3/app_access_token/internal", {
    app_id: process.env.LARK_APP_ID,
    app_secret: process.env.LARK_APP_SECRET,
  });
  if (app.code !== 0 || !app.app_access_token) throw new Error(`app_access_token: ${app.msg ?? app.code}`);
  const tok = await larkPost<{ code: number; msg?: string; data?: { access_token: string } }>(
    "/open-apis/authen/v1/oidc/access_token",
    { grant_type: "authorization_code", code },
    app.app_access_token,
  );
  if (tok.code !== 0 || !tok.data?.access_token) throw new Error(`access_token: ${tok.msg ?? tok.code}`);
  const res = await fetch(`${lark.domain()}/open-apis/authen/v1/user_info`, { headers: { authorization: `Bearer ${tok.data.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const info = (await res.json()) as {
    code: number; msg?: string;
    data?: { name: string; en_name?: string; avatar_url?: string; email?: string; enterprise_email?: string; open_id: string; union_id?: string };
  };
  if (info.code !== 0 || !info.data) throw new Error(`user_info: ${info.msg ?? info.code}`);
  const d = info.data;
  const email = (d.enterprise_email || d.email || `${d.union_id ?? d.open_id}@lark.user`).toLowerCase();
  return { email, name: d.name || d.en_name || email.split("@")[0], image: d.avatar_url ?? null, openId: d.open_id };
}
