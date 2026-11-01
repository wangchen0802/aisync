import { currentUser } from "@/auth";
import { listSignals, type Filters } from "@/lib/signals";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("; ") : v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the signal feed with the same filters as /signals. */
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const f: Filters = {
    q: sp.get("q") || undefined, channel: sp.get("channel") || undefined, topic: sp.get("topic") || undefined, category: sp.get("category") || undefined,
    intent: sp.get("intent") || undefined, org: sp.get("org") || undefined, starred: sp.get("starred") === "1", days: Number(sp.get("days")) || undefined,
    source: Number(sp.get("source")) || undefined, listing: (sp.get("listing") as Filters["listing"]) || "", sort: "new", limit: 200,
  };
  const head = ["id", "date", "channel", "intent", "category", "relevance", "org", "title", "summary", "topics", "buyers", "vendors", "pay_min", "pay_max", "pay_unit", "url", "note"];
  const rows: string[] = [head.join(",")];
  for (let offset = 0; offset < 5000; offset += 200) {
    const { rows: batch } = await listSignals({ ...f, offset });
    for (const s of batch) rows.push([s.id, (s.published_at ?? s.first_seen_at).slice(0, 10), s.channel, s.intent, s.category, s.relevance, s.org, s.title, s.summary, s.topics, s.buyers, s.vendors, s.pay_min, s.pay_max, s.pay_unit, s.url, s.note].map(cell).join(","));
    if (batch.length < 200) break;
  }
  return new Response("﻿" + rows.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="radar-signals-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
