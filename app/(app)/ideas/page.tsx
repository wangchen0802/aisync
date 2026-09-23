import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listItems, listProjects } from "@/lib/core";
import { ago, code } from "@/lib/meta";
import { IdeaActions, IdeaInput } from "@/components/ideas-client";
import { Avatar, Icon, Proj } from "@/components/ui";

export const metadata = { title: "想法" };

export default async function Ideas() {
  const me = await requireUser();
  const [items, projects] = await Promise.all([listItems(me.id, { kind: "idea", limit: 300 }), listProjects()]);
  const mine = items.filter((i) => i.owner_id === me.id && i.status === "open");
  const shared = items.filter((i) => i.visibility === "team" && i.owner_id !== me.id && i.status === "open");
  const converted = items.filter((i) => i.owner_id === me.id && i.status === "resolved").slice(0, 8);
  return (
    <>
      <div className="ph">
        <div>
          <h1>想法</h1>
          <p>还没想清楚的东西先放这里：默认只有自己看得到。成熟了就一键分享，或者转成决策、任务、待定问题进入团队流程。你的 AI 也能读到它们（仅在「我的」上下文里）。</p>
        </div>
      </div>
      <IdeaInput projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      <section className="stack" style={{ gap: 10 }}>
        <h2 className="sec-h">我的想法 <span className="c">{mine.length}</span></h2>
        {mine.length ? (
          <div className="idea-grid">
            {mine.map((i) => (
              <article key={i.id} className="box idea">
                <div className="meta"><span className="ref">{code("idea", i.id)}</span>{i.visibility === "team" ? <span className="pill ok">已分享</span> : <span className="pill"><Icon name="lock" className="i sm" /> 仅自己</span>}<Proj name={i.project_name} color={i.project_color} /><span>{ago(i.created_at)}</span></div>
                <Link href={`/item/${i.id}`} className="idea-t">{i.title}</Link>
                {i.body ? <p className="idea-b">{i.body}</p> : null}
                <IdeaActions id={i.id} shared={i.visibility === "team"} />
              </article>
            ))}
          </div>
        ) : <div className="box"><div className="empty"><p>还没有想法。随手记下的灵感、疑虑、方案草稿都可以放这里。</p></div></div>}
      </section>
      {shared.length ? (
        <section className="stack" style={{ gap: 10 }}>
          <h2 className="sec-h">队友分享的想法 <span className="c">{shared.length}</span></h2>
          <div className="idea-grid">
            {shared.map((i) => (
              <article key={i.id} className="box idea">
                <div className="meta"><Avatar id={i.owner_id} name={i.owner_name} /><b>{i.owner_name}</b><Proj name={i.project_name} color={i.project_color} /><span>{ago(i.created_at)}</span></div>
                <Link href={`/item/${i.id}`} className="idea-t">{i.title}</Link>
                {i.body ? <p className="idea-b">{i.body}</p> : null}
                <Link className="more" href={`/item/${i.id}#discuss`}><Icon name="chat" className="i sm" />{i.comment_count ? `${i.comment_count} 条讨论` : "说说你的看法"}</Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {converted.length ? (
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="sec-h">已转化</h2>
          <div className="chips">{converted.map((i) => <Link key={i.id} href={`/item/${(i.details as { converted_to?: number }).converted_to ?? i.id}`} className="chip">✓ {i.title.slice(0, 30)}</Link>)}</div>
        </section>
      ) : null}
    </>
  );
}
