import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`; external schedulers can use ?key=. */
export function cronAllowed(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "CRON_SECRET 未配置" };
  const url = new URL(req.url);
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("key") ?? "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "unauthorized" };
}
