import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { ackThreshold, getItem, listComments, listGoals, listMembers } from "@/lib/core";
import { q } from "@/lib/db";
import { agree, confirmNow, deleteItem, reopenDecision, resolveConflict, resolveQuestion } from "@/lib/actions";
import { ago, code, DECISION_STATUS, fmtDay, KIND_LABEL, TASK_STATUS, todayISO, weekStart, type Kind } from "@/lib/meta";
import { IdeaActions } from "@/components/ideas-client";
import { DueChip } from "@/components/ui";
import { ActionButton, CopyButton, ObjectButton } from "@/components/client";
import { CommentForm, EditableText, TaskControls } from "@/components/item-client";
import { Acks } from "@/components/items";
import { Avatar, Icon, Proj, Source } from "@/components/ui";
import { origin } from "@/lib/origin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id.replace(/^[A-Za-z]-?/, ""));
  const item = id ? await getItem(id) : null;
  return { title: item ? `${code(item.kind, item.id)} ${item.title}` : "条目" };
}

const VERB: Record<string, string> = {
  create: "创建", publish: "发布", ack: "同意", object: "提出异议", confirm: "达成共识", conflict: "发现冲突", resolve: "解决",
  task_progress: "更新进度", task_move: "移动", reopen: "重新打开", comment: "评论",
};

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id.replace(/^[A-Za-z]-?/, ""));
  const item = id ? await getItem(id) : null;
  if (!item || item.visibility === "draft" || (item.visibility === "private" && item.owner_id !== me.id)) notFound();
  const [goals, comments, threshold, members, history, other, related] = await Promise.all([
    item.kind === "task" ? listGoals(me.id, weekStart(todayISO())) : Promise.resolve([]),
    listComments(id),
    ackThreshold(),
    listMembers(),
    q<{ id: number; type: string; text: string; created_at: string; name: string | null }>(
      "select e.id, e.type, e.text, e.created_at, u.name from events e left join users u on u.id = e.user_id where e.item_id = $1 and e.type <> 'comment' order by e.created_at desc limit 30",
      [id],
    ),
    item.conflict_with ? getItem(item.conflict_with) : Promise.resolve(null),
    q<{ id: number; kind: string; title: string; status: string }>(
      `select id, kind, title, status from items where visibility = 'team' and id <> $1 and (
         blocked_by = $1 or id = $2 or id = $3 or id = $4 or superseded_by = $1 or conflict_with = $1 or duplicate_of = $1)`,
      [id, item.blocked_by ?? 0, item.superseded_by ?? 0, item.duplicate_of ?? 0],
    ),
  ]);
  const ref = code(item.kind, item.id);
  const link = `${await origin()}/item/${item.id}`;
  const canForce = item.owner_id === me.id || me.role === "admin";
  const mine = item.acks.find((a) => a.user_id === me.id);
  const status = item.kind === "task" ? TASK_STATUS[item.status] : item.kind === "decision" ? DECISION_STATUS[item.status] : item.kind === "idea" ? (item.status === "resolved" ? "已转化" : item.visibility === "team" ? "已分享" : "仅自己") : item.status === "resolved" ? "已解决" : "开放";
  const back = item.kind === "task" ? "/tasks" : item.kind === "idea" ? "/ideas" : "/consensus";
  const activeMembers = members.filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="item-page">
      <div className="row" style={{ gap: 6 }}>
        <Link className="btn ghost sm" href={back}><Icon name="back" />{item.kind === "task" ? "任务" : item.kind === "idea" ? "想法" : "共识"}</Link>
      </div>

      <section className="box pad stack" style={{ gap: 14 }}>
        <div className="meta">
          <span className="ref">{ref}</span>
          <span className={`kind k-${item.kind}`}>{KIND_LABEL[item.kind as Kind]}</span>
          <span className={`tag s-${item.status}`}>{status}</span>
          <Proj name={item.project_name} color={item.project_color} />
          {item.visibility === "private" ? <span className="pill"><Icon name="lock" className="i sm" /> 仅自己</span> : null}
        </div>
        <h1 className="item-title">{item.title}</h1>
        {item.body ? <p className="item-body">{item.body}</p> : null}
        <div className="meta">
          <Avatar id={item.owner_id} name={item.owner_name} />
          <span>{item.owner_name} 提出</span>
          <Source s={item.source} />
          <span>{ago(item.created_at)}</span>
          {item.kind === "task" && item.assignee_name ? <><span>·</span><Avatar id={item.assignee_id} name={item.assignee_name} /><span>{item.assignee_name} 负责</span></> : null}
          {item.due_date ? <><span>· DDL {fmtDay(item.due_date)}</span><DueChip date={item.due_date} status={item.status} /></> : null}
        </div>

        {item.kind === "decision" ? (
          <div className="decide">
            <Acks item={item} threshold={threshold} />
            <div className="row">
              {item.status === "discussing" ? (
                <>
                  {mine?.verdict !== "agree" ? <ActionButton className="btn pri" action={agree.bind(null, item.id)}><Icon name="check" />同意</ActionButton> : <span className="meta"><Icon name="check" className="i sm" />你已同意</span>}
                  <ObjectButton id={item.id} />
                  {canForce ? <ActionButton className="btn ghost" action={confirmNow.bind(null, item.id)}>直接拍板</ActionButton> : null}
                </>
              ) : null}
              {(item.status === "confirmed" || item.status === "superseded") && canForce ? <ActionButton className="btn ghost" action={reopenDecision.bind(null, item.id)}>重新讨论</ActionButton> : null}
            </div>
          </div>
        ) : null}

        {item.status === "conflict" && other ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="note err">和 <Link className="link" href={`/item/${other.id}`}>{code("decision", other.id)}</Link> 冲突{item.details.reason ? `：${item.details.reason}` : ""}</div>
            <div className="vs">
              <div><span className="meta"><Avatar id={item.owner_id} name={item.owner_name} />{item.owner_name} · <Source s={item.source} /></span>{item.title}</div>
              <div><span className="meta"><Avatar id={other.owner_id} name={other.owner_name} />{other.owner_name} · <Source s={other.source} /></span>{other.title}</div>
            </div>
            <div className="row">
              <ActionButton className="btn pri" action={resolveConflict.bind(null, item.id, "this")}>采用 {ref}</ActionButton>
              <ActionButton className="btn" action={resolveConflict.bind(null, item.id, "other")}>保留 {code("decision", other.id)}</ActionButton>
            </div>
          </div>
        ) : null}

        {item.kind === "task" ? <TaskControls id={item.id} status={item.status} subtasks={item.subtasks} assigneeId={item.assignee_id} due={item.due_date} members={activeMembers} goals={goals.map((g) => ({ id: g.id, title: g.title }))} goalId={item.goal_id} /> : null}
        {item.kind === "idea" && item.owner_id === me.id && item.status === "open" ? <IdeaActions id={item.id} shared={item.visibility === "team"} /> : null}
        {item.kind === "question" && item.status === "open" ? <div><ActionButton className="btn" action={resolveQuestion.bind(null, item.id)}>标记已解决</ActionButton></div> : null}

        <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <CopyButton className="btn sm" label="复制给 AI" text={`[团队${KIND_LABEL[item.kind as Kind]} ${ref}] ${item.title}${item.body ? `。${item.body}` : ""}`} done="已复制" />
          <CopyButton className="btn sm" label="复制链接" text={`${ref} ${item.title}\n${link}`} done="已复制" />
          <EditableText id={item.id} title={item.title} body={item.body} />
          <span className="grow" />
          {canForce ? <ActionButton className="btn sm ghost danger" confirm="删除这条记录？" action={deleteItem.bind(null, item.id)}><Icon name="trash" />删除</ActionButton> : null}
        </div>
      </section>

      {item.details.alternatives?.length || item.details.quote || related.length ? (
        <section className="box pad stack" style={{ gap: 12 }}>
          {item.details.alternatives?.length ? <div className="detail"><h5>考虑过的备选方案</h5><ul>{item.details.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul></div> : null}
          {item.details.quote ? <div className="detail"><h5>原始对话片段</h5><div className="quote">“{item.details.quote}”</div></div> : null}
          {related.length ? (
            <div className="detail"><h5>相关条目</h5>
              {related.map((r) => <Link key={r.id} href={`/item/${r.id}`} className="row" style={{ gap: 8 }}><span className="ref">{code(r.kind, r.id)}</span><span>{r.title}</span><span className={`tag s-${r.status}`}>{r.kind === "task" ? TASK_STATUS[r.status] : DECISION_STATUS[r.status] ?? r.status}</span></Link>)}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="box" id="discuss">
        <div className="box-h"><h2><Icon name="chat" />讨论 <span className="c">{comments.length}</span></h2></div>
        <div className="thread">
          {comments.map((c) => (
            <div className="cm" key={c.id}>
              <Avatar id={c.user_id} name={c.name} image={c.image} lg />
              <div>
                <div className="meta"><b>{c.name}</b><span>{ago(c.created_at)}</span></div>
                <p>{c.body}</p>
              </div>
            </div>
          ))}
          {!comments.length ? <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>暂无讨论</p> : null}
        </div>
        <div className="pad" style={{ borderTop: "1px solid var(--line)" }}><CommentForm itemId={item.id} /></div>
      </section>

      {history.length ? (
        <section className="box">
          <div className="box-h"><h2><Icon name="clock" />历史</h2></div>
          <ul className="history">
            {history.map((h) => <li key={h.id}><span className="muted">{ago(h.created_at)}</span><b>{h.name}</b><span>{VERB[h.type] ?? h.type}</span><span className="muted">{h.type === "task_progress" || h.type === "object" ? h.text : ""}</span></li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
