import { currentUser } from "@/auth";
import { search } from "@/lib/core";

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const items = await search(me.id, q, 8);
  return Response.json(items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, status: i.status, owner: i.assignee_name ?? i.owner_name })));
}
