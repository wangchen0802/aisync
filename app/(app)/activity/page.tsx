import Link from "next/link";
import { requireUser } from "@/lib/session";
import { q } from "@/lib/db";
import { ago, code } from "@/lib/meta";
import { Avatar, Proj, Source } from "@/components/ui";

export const metadata = { title: "动态" };

type Ev = {
  id: number; type: string; text: string; created_at: string; user_id: number | null; user_name: string | null; image: string | null;
  item_id: number | null; item_kind: string | null; item_title: string | null; conv_title: string | null; conv_source: string | null;
  project: string | null; color: string | null; produced: { kind: string; title: string }[] | null;
};

const VERB: Record<string, string> = {
  publish: "同步了一段对话", ack: "确认了共识", object: "提出异议", confirm: "达成共识", conflict: "发现冲突", resolve: "解决了",
  create: "新建了", task_progress: "推进了任务", task_move: "移动了任务", reopen: "重新打开讨论",
};

export default async function Activity({ searchParams }: { searchParams: Promise<{ synced?: string }> }) {
  const synced = Number((await searchParams).synced);
  const me = await requireUser();
  const events = await q<Ev>(
    `select e.id, e.type, e.text, e.created_at, e.user_id, u.name as user_name, u.image,
            e.item_id, i.kind as item_kind, i.title as item_title, c.title as conv_title, c.source as conv_source,
            coalesce(p1.name, p2.name) as project, coalesce(p1.color, p2.color) as color,
            (select json_agg(json_build_object('kind', x.kind, 'title', x.title) order by x.id) from items x where x.conversation_id = e.conversation_id and x.visibility = 'team') as produced
     from events e
     left join users u on u.id = e.user_id
     left join items i on i.id = e.item_id
     left join conversations c on c.id = e.conversation_id
     left join projects p1 on p1.id = i.project_id
     left join projects p2 on p2.id = c.project_id
     where (i.id is null or i.visibility = 'team' or i.owner_id = $1)
     order by e.created_at desc limit 150`,
    [me.id],
  );
  const groups = new Map<string, Ev[]>();
  for (const e of events) {
    const d = new Date(e.created_at).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai" });
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(e);
  }
  return (
    <>
      <div className="ph">
        <div>
          <h1>动态</h1>
          <p>谁在用 AI 推进什么。这里只显示本人发布的结论和进展，原始对话不会公开。</p>
        </div>
      </div>
      {synced ? <div className="note" style={{ color: "var(--green)", background: "var(--green-bg)", borderColor: "transparent" }}>✓ 已自动发布 {synced} 条到团队</div> : null}
      <section className="box">
        {events.length ? [...groups.entries()].map(([day, evs]) => (
          <div key={day}>
            <div className="day">{day}</div>
            {evs.map((e) => (
              <div className="ev" key={e.id} data-x>
                <Avatar id={e.user_id} name={e.user_name} image={e.image} lg />
                <div style={{ minWidth: 0 }}>
                  <div className="meta">
                    <b>{e.user_name ?? "有人"}</b><span>{VERB[e.type] ?? e.type}</span>
                    {e.conv_source ? <Source s={e.conv_source} /> : null}
                    <Proj name={e.project} color={e.color} />
                    <span>{ago(e.created_at)}</span>
                  </div>
                  {e.type === "publish" ? (
                    <>
                      <p style={{ fontWeight: 500, color: "var(--ink)" }}>{e.conv_title}</p>
                      <div className="d-std"><p>{e.text}</p></div>
                      {e.produced?.length ? (
                        <div className="row" style={{ marginTop: 8, gap: 6 }}>
                          {e.produced.slice(0, 6).map((p, i) => <span key={i} className={`kind k-${p.kind}`}>{p.title.slice(0, 28)}{p.title.length > 28 ? "…" : ""}</span>)}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>
                      {e.item_id && e.item_kind ? (
                        <Link className="link" style={{ fontSize: 13 }} href={`/item/${e.item_id}`}>{code(e.item_kind, e.item_id)}</Link>
                      ) : null}{" "}
                      {e.type === "create" || e.type === "task_progress" ? `${e.item_title ?? ""}${e.type === "task_progress" ? `：${e.text}` : ""}` : e.text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )) : <div className="empty"><b>还没有动态</b><p>大家同步 AI 对话、确认共识、推进任务后，会按时间出现在这里。</p></div>}
      </section>
    </>
  );
}
