import Link from "next/link";
import { requireUser } from "@/lib/session";
import { draftsOf, inbox, listProjects } from "@/lib/core";
import { ago } from "@/lib/meta";
import { InboxReview } from "@/components/inbox-review";
import { Source } from "@/components/ui";

export const metadata = { title: "收件箱" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const me = await requireUser();
  const convs = await inbox(me.id);
  const want = Number((await searchParams).c);
  const current = convs.find((c) => c.id === want) ?? convs[0];
  const [drafts, projects] = await Promise.all([current ? draftsOf(current.id) : Promise.resolve([]), listProjects()]);

  return (
    <>
      <div className="ph">
        <div>
          <h1>收件箱</h1>
          <p>AI 已经替你提炼好了。勾选要发布的条目，可以直接改文字。没发布的内容只有你自己看得到。</p>
        </div>
        <Link className="btn" href="/import">导入对话</Link>
      </div>
      {!current ? (
        <section className="box">
          <div className="empty">
            <b>收件箱是空的</b>
            <p>通过浏览器插件、Claude Code 或手动粘贴同步的对话，会先到这里等你审核。</p>
            <div className="row" style={{ justifyContent: "center" }}><Link className="btn pri" href="/import">导入对话</Link><Link className="btn" href="/connect">安装插件</Link></div>
          </div>
        </section>
      ) : (
        <div className="ib">
          <section className="box ss">
            {convs.map((c) => (
              <Link key={c.id} className="sess" href={`/inbox?c=${c.id}`} aria-current={c.id === current.id ? "true" : undefined}>
                <span className="t">{c.title || "未命名对话"}</span>
                <span className="meta"><Source s={c.source} /><span>{ago(c.created_at)}</span></span>
              </Link>
            ))}
          </section>
          <InboxReview
            key={current.id}
            conv={{ id: current.id, title: current.title, summary: current.summary, source: current.source, created_at: current.created_at, project_id: current.project_id, engine: current.engine, sensitive: current.sensitive, url: current.url }}
            drafts={drafts.map((d) => ({ id: d.id, kind: d.kind, title: d.title, body: d.body, sensitive: Boolean(d.details.sensitive), assignee: d.details.assignee ?? "", due: d.due, subtasks: d.subtasks.map((s) => s.title), note: d.details.note ?? "", doneSubtasks: d.details.done_subtasks ?? [], newStatus: d.details.new_status ?? "" }))}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      )}
    </>
  );
}
