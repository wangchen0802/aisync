import { currentUser } from "@/auth";
import { canSee, listContacts, toCSV } from "@/lib/outreach";
import { pipelineOf } from "@/lib/outreach-meta";
import { todayISO } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return new Response("unauthorized", { status: 401 });
  const p = pipelineOf(new URL(req.url).searchParams.get("p")).key;
  const me = { ...u, name: u.name || u.email };
  if (!(await canSee(me, p))) return new Response("forbidden", { status: 403 });
  const csv = toCSV(await listContacts(p));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="simreal-${p}-${todayISO()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
