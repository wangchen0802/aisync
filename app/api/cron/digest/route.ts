import { buildDigest, digestToSlack } from "@/lib/digest";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!process.env.SLACK_WEBHOOK_URL) return Response.json({ skipped: "SLACK_WEBHOOK_URL not set" });
  const d = await buildDigest();
  if (!d.sections.length) return Response.json({ skipped: "nothing new" });
  await digestToSlack(d, new URL(req.url).origin);
  return Response.json({ ok: true });
}
