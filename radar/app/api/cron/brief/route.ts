import { NextResponse } from "next/server";
import { generateBrief } from "@/lib/brief";
import { cronAllowed } from "@/lib/cron";
import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly brief (Monday 09:00 Beijing by default): writes it and posts it to the team channels. */
export async function GET(req: Request) {
  const gate = cronAllowed(req);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 401 });
  const send = (await getSetting("brief_send", "on")) !== "off";
  const b = await generateBrief({ send });
  return NextResponse.json({ week: b.week, engine: b.engine, sent: Boolean(b.sent_at) || send });
}
