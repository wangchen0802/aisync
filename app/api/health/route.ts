import { NextResponse } from "next/server";
import { dbConfigured, q } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { authProviders } from "@/auth";

export const dynamic = "force-dynamic";

/** Deployment self-check. Reports which pieces are configured — never their values. */
export async function GET() {
  let db = false;
  let dbError: string | undefined;
  if (dbConfigured()) {
    try {
      await q("select 1");
      db = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message.slice(0, 120) : "unknown";
    }
  }
  const checks = {
    database: db,
    auth_secret: Boolean(process.env.AUTH_SECRET),
    ai: aiEnabled(),
    login: Object.entries(authProviders).filter(([, on]) => on).map(([k]) => k),
    cron_secret: Boolean(process.env.CRON_SECRET),
  };
  const ok = checks.database && checks.auth_secret && checks.login.length > 0;
  return NextResponse.json({ ok, ...checks, ...(dbError ? { database_error: dbError } : {}) }, { status: ok ? 200 : 503 });
}
