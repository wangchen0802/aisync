import { NextResponse } from "next/server";
import { authProviders } from "@/auth";
import { dbConfigured, q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Deployment self-check: which settings are present (never their values). */
export async function GET() {
  let database = false;
  let error: string | undefined;
  if (dbConfigured()) {
    try {
      await q("select 1 from rd_sources limit 1");
      database = true;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return NextResponse.json({
    database,
    error,
    auth_secret: Boolean(process.env.AUTH_SECRET),
    login: Object.entries(authProviders).filter(([, v]) => v).map(([k]) => k),
    cron_secret: Boolean(process.env.CRON_SECRET),
    channels: {
      x: Boolean(process.env.X_BEARER_TOKEN),
      reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
      github_token: Boolean(process.env.GITHUB_TOKEN),
    },
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
