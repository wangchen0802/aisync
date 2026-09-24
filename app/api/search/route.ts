import { currentUser } from "@/auth";
import { search } from "@/lib/core";
import { q as sql } from "@/lib/db";
import { visiblePipelines } from "@/lib/outreach";
import { stageLabel } from "@/lib/outreach-meta";

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const items = await search(me.id, q, 8);
  const hits = items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, status: i.status, owner: i.assignee_name ?? i.owner_name }));
  if (q.length < 1) return Response.json(hits);
  const pipes = await visiblePipelines({ ...me, name: me.name || me.email });
  const contacts = await sql<{ id: number; pipeline: string; org: string; name: string; stage: string; owner: string | null }>(
    `select c.id, c.pipeline, c.org, c.name, c.stage, u.name as owner from contacts c left join users u on u.id = c.owner_id
     where c.pipeline = any($1) and position(lower($2) in lower(c.org || ' ' || c.name || ' ' || c.email)) > 0
     order by c.updated_at desc limit 5`,
    [pipes, q],
  );
  return Response.json([
    ...contacts.map((c) => ({ id: c.id, kind: "contact", title: [c.org, c.name].filter(Boolean).join(" · "), status: stageLabel(c.pipeline, c.stage), owner: c.owner })),
    ...hits,
  ]);
}
