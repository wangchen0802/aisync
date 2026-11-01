import { NextResponse } from "next/server";
import { classifyPending } from "@/lib/ai";
import { sendAlerts } from "@/lib/alerts";
import { cronAllowed } from "@/lib/cron";
import { runDue } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Runs every due channel, then AI classification (if configured) and alerts. Vercel cron or any external scheduler. */
export async function GET(req: Request) {
  const gate = cronAllowed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });
  const started = new Date();
  const results = await runDue(190_000, "cron");
  const ai = await classifyPending(Math.max(20_000, 270_000 - (Date.now() - started.getTime())));
  const alerts = await sendAlerts(started);
  return NextResponse.json({
    ran: results.length,
    new: results.reduce((n, r) => n + r.new, 0),
    changed: results.reduce((n, r) => n + r.changed, 0),
    errors: results.filter((r) => r.error).map((r) => ({ source: r.name, error: r.error })),
    ai,
    alerts,
    ms: Date.now() - started.getTime(),
  });
}
