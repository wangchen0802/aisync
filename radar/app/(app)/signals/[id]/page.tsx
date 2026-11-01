import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getSignal, listSignals } from "@/lib/signals";
import { CATEGORY_LABEL, INTENT_HELP, INTENT_LABEL, ORG_TYPE_LABEL } from "@/lib/taxonomy";
import { topicMeta } from "@/lib/trends";
import { SignalItem, SignalList } from "@/components/signal";
import { Icon } from "@/components/ui";

export default async function SignalPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!id) notFound();
  const s = await getSignal(id);
  if (!s) notFound();
  const [meta, themes, related, changes] = await Promise.all([
    topicMeta(),
    q<{ id: number; title: string }>("select id, title from rd_themes where status <> 'parked' order by updated_at desc limit 30"),
    s.topics.length ? listSignals({ topic: s.topics[0], days: 30, limit: 8, sort: "relevance" }) : Promise.resolve({ rows: [], total: 0 }),
    q<{ type: string; detail: string; created_at: string }>("select type, detail, created_at from rd_changes where signal_id = $1 order by created_at desc", [id]),
  ]);
  const facts: [string, React.ReactNode][] = [
    ["渠道", s.source_name],
    ["类型", `${INTENT_LABEL[s.intent] ?? s.intent} · ${INTENT_HELP[s.intent] ?? ""}`],
    ["类别", CATEGORY_LABEL[s.category] ?? s.category],
    ["公司", s.org ? `${s.org}${s.org_type ? `（${ORG_TYPE_LABEL[s.org_type] ?? s.org_type}）` : ""}` : "—"],
    ["提到的实验室", s.buyers.join("、") || "—"],
    ["提到的数据商", s.vendors.join("、") || "—"],
    ["发布时间", fmtDate(s.published_at) || "—"],
    ["首次发现", fmtDate(s.first_seen_at)],
    ["分类方式", s.engine === "ai" ? "Claude" : "关键词规则"],
  ];
  if (s.is_listing) facts.splice(4, 0, ["岗位", `${s.subtype === "expert" ? "专家 / 标注类" : "全职 / 其他"}${s.location ? ` · ${s.location}` : ""}${s.closed_at ? ` · 已下架 ${fmtDate(s.closed_at)}` : " · 在招"}`]);
  return (
    <>
      <Link className="back-link" href="/signals"><Icon name="back" className="i sm" />信号</Link>
      <section className="box"><SignalItem s={s} meta={meta} themes={themes} /></section>
      <div className="ov">
        <section className="box">
          <div className="box-h"><h2>原文</h2>{s.url ? <a className="link" href={s.url} target="_blank" rel="noreferrer">打开来源 <Icon name="ext" className="i sm" /></a> : null}</div>
          <div className="pad" style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.65, overflowWrap: "anywhere", maxHeight: 640, overflowY: "auto" }}>{s.full_body || "（没有正文）"}</div>
        </section>
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>信息</h2></div>
            <div className="kv" style={{ gridTemplateColumns: "110px minmax(0,1fr)", gap: "8px 12px", fontSize: 12.5 }}>
              {facts.map(([k, v]) => <Fragment key={k}><span>{k}</span><span>{v}</span></Fragment>)}
            </div>
          </section>
          {changes.length ? (
            <section className="box">
              <div className="box-h"><h2>变化记录</h2></div>
              <ul className="mini">{changes.map((c, i) => <li key={i}><span className="t">{c.detail || c.type}</span><span className="s">{fmtDate(c.created_at)}</span></li>)}</ul>
            </section>
          ) : null}
        </div>
      </div>
      {related.rows.filter((r) => r.id !== id).length ? (
        <section className="box">
          <div className="box-h"><h2>同主题的近期信号 <span className="c">{meta[s.topics[0]]?.label}</span></h2></div>
          <SignalList rows={related.rows.filter((r) => r.id !== id).slice(0, 6)} meta={meta} themes={themes} />
        </section>
      ) : null}
    </>
  );
}
