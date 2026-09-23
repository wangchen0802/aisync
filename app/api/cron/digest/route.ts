import { buildDigest, pushDigest } from "@/lib/digest";
import { hasWebhook } from "@/lib/notify";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!(await hasWebhook())) return Response.json({ skipped: "no notification channel configured" });
  const d = await buildDigest();
  if (!d.sections.length) return Response.json({ skipped: "nothing new" });
  const channels = await pushDigest(d);
  return Response.json({ ok: true, channels });
}
