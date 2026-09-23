import Link from "next/link";
import type { ItemRow } from "@/lib/core";
import { ago, code, DECISION_STATUS, KIND_LABEL, type Kind } from "@/lib/meta";
import { agree, confirmNow, deleteItem, reopenDecision, resolveConflict, resolveQuestion } from "@/lib/actions";
import { ActionButton, CopyButton, Expander, ObjectButton } from "@/components/client";
import { Avatar, Icon, Proj, Source } from "@/components/ui";

type Me = { id: number; role: string };

export function Acks({ item, threshold }: { item: ItemRow; threshold: number }) {
  const agrees = item.acks.filter((a) => a.verdict === "agree");
  return (
    <span className="acks" title={item.acks.map((a) => `${a.name}${a.verdict === "agree" ? " 同意" : " 有异议"}`).join("、")}>
      <span className="avs">{agrees.slice(0, 5).map((a) => <Avatar key={a.user_id} id={a.user_id} name={a.name} />)}</span>
      {item.status === "discussing" ? `${agrees.length}/${threshold} 已确认` : `${agrees.length} 人确认`}
    </span>
  );
}

export function DecisionRow({ item, me, threshold, other }: { item: ItemRow; me: Me; threshold: number; other?: ItemRow | null }) {
  const mine = item.acks.find((a) => a.user_id === me.id);
  const canForce = item.owner_id === me.id || me.role === "admin";
  const objections = item.acks.filter((a) => a.verdict === "object");
  const ref = code(item.kind, item.id);
  return (
    <article className={`it ${item.status}`} id={ref} data-x>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <h3><span className="ref">{ref}</span>{item.kind !== "decision" ? <span className={`kind k-${item.kind}`}>{KIND_LABEL[item.kind as Kind]}</span> : null}{item.title}</h3>
        {item.body ? <div className="d-std"><p className="why">{item.body}</p></div> : null}
        <div className="meta">
          <Avatar id={item.owner_id} name={item.owner_name} />
          <span>{item.owner_name}</span>
          <Source s={item.source} />
          <Proj name={item.project_name} color={item.project_color} />
          <span>{ago(item.created_at)}</span>
          {item.visibility === "private" ? <span className="pill"><Icon name="lock" className="i sm" /> 仅自己</span> : null}
        </div>
      </div>
      <div className="right">
        {item.kind === "decision" ? <span className={`tag s-${item.status}`}>{DECISION_STATUS[item.status]}</span> : <span className={`tag s-${item.status}`}>{item.status === "resolved" ? "已解决" : "开放"}</span>}
        {item.kind === "decision" ? <Acks item={item} threshold={threshold} /> : null}
      </div>

      {item.status === "conflict" && other ? (
        <div className="full">
          <div className="at-b">
            <p className="muted" style={{ fontSize: 12.5 }}>与 <Link className="link" href={`#${code("decision", other.id)}`}>{code("decision", other.id)}</Link> 冲突{item.details.reason ? `：${item.details.reason}` : ""}</p>
            <div className="vs">
              <div><span className="meta"><Avatar id={item.owner_id} name={item.owner_name} />{item.owner_name} · <Source s={item.source} /></span>{item.title}</div>
              <div><span className="meta"><Avatar id={other.owner_id} name={other.owner_name} />{other.owner_name} · <Source s={other.source} /></span>{other.title}</div>
            </div>
            <div className="row">
              <ActionButton className="btn sm pri" action={resolveConflict.bind(null, item.id, "this")}>采用新方案（{ref}）</ActionButton>
              <ActionButton action={resolveConflict.bind(null, item.id, "other")}>保留原共识（{code("decision", other.id)}）</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      {objections.length ? (
        <div className="full">
          {objections.map((o) => <div key={o.user_id} className="note warn" style={{ padding: "6px 10px" }}><b>{o.name}</b> 有异议{o.comment ? `：${o.comment}` : ""}</div>)}
        </div>
      ) : null}

      <div className="full foot">
        <Expander label="推理与来源" />
        {item.kind === "decision" && item.status === "discussing" ? (
          <>
            {mine?.verdict !== "agree" ? <ActionButton className="btn sm pri" action={agree.bind(null, item.id)}><Icon name="check" />同意</ActionButton> : <span className="meta"><Icon name="check" className="i sm" />你已同意</span>}
            <ObjectButton id={item.id} />
            {canForce ? <ActionButton className="btn sm ghost" action={confirmNow.bind(null, item.id)} title="跳过投票，直接形成共识">直接拍板</ActionButton> : null}
          </>
        ) : null}
        {item.kind === "question" && item.status === "open" ? <ActionButton action={resolveQuestion.bind(null, item.id)}>标记已解决</ActionButton> : null}
        {item.status === "superseded" && item.superseded_by ? <span className="meta">已被 <Link className="link" href={`#${code("decision", item.superseded_by)}`}>{code("decision", item.superseded_by)}</Link> 取代</span> : null}
        {item.kind === "decision" && (item.status === "confirmed" || item.status === "superseded") && canForce ? <ActionButton className="btn sm ghost" action={reopenDecision.bind(null, item.id)}>重新讨论</ActionButton> : null}
        <CopyButton className="link" label="引用到我的 AI" text={`[团队共识 ${ref}] ${item.title}${item.body ? `。理由：${item.body}` : ""}`} done="已复制，可以粘贴到任何 AI 对话里" />
      </div>

      <div className="full d-full">
        <div className="detail">
          {item.details.alternatives?.length ? <div><h5>考虑过的备选方案</h5><ul>{item.details.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul></div> : null}
          {item.details.quote ? <div><h5>原始对话片段</h5><div className="quote">“{item.details.quote}”</div></div> : null}
          <div className="meta">
            <span>确认：{item.acks.filter((a) => a.verdict === "agree").map((a) => a.name).join("、") || "暂无"}</span>
            {item.conversation_id ? <span>· 来自一次 {item.source === "manual" ? "手动" : ""}AI 对话</span> : null}
            {canForce ? <ActionButton className="btn sm ghost danger" confirm="删除这条记录？" action={deleteItem.bind(null, item.id)}><Icon name="trash" />删除</ActionButton> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
