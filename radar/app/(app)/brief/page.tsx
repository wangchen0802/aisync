import Link from "next/link";
import { aiEnabled } from "@/lib/ai";
import { getContextPack, makeBrief, sendBriefNow } from "@/lib/actions";
import { weekOf, type Brief } from "@/lib/brief";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { ActionButton, AnalyzeIn } from "@/components/client";
import { Markdown } from "@/components/markdown";
import { Empty, Icon } from "@/components/ui";

export const metadata = { title: "周报" };

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sp = await searchParams;
  const briefs = await q<Brief>("select id, week, body, engine, created_at, sent_at, stats from rd_briefs order by week desc limit 26");
  const cur = briefs.find((b) => b.week === sp.w) ?? briefs[0];
  const thisWeek = weekOf();
  const ai = aiEnabled();
  const aiError = (cur?.stats as { aiError?: string } | undefined)?.aiError;
  return (
    <>
      <div className="ph">
        <div>
          <h1>周报</h1>
          <p>
            每周一 9:00 自动生成并发到群里。{ai ? "Claude 会读本周的统计和信号写成简报，每个判断都标出依据的信号编号。" : "没有配置 ANTHROPIC_API_KEY：自动生成统计版；想要分析版，点「在 Claude 中分析」用你自己的订阅。"}
          </p>
        </div>
        <div className="row">
          <AnalyzeIn getText={getContextPack.bind(null, 7)} />
          <ActionButton className="btn" action={makeBrief.bind(null, false)} pendingText={ai ? "AI 正在写…" : "生成中…"}><Icon name="bolt" />{briefs[0]?.week === thisWeek ? "重新生成本周" : "生成本周简报"}</ActionButton>
        </div>
      </div>
      <div className="ib">
        <section className="box">
          <div className="box-h"><h2>历史</h2></div>
          {briefs.length ? (
            <ul className="brief-list">
              {briefs.map((b) => (
                <li key={b.id}><Link href={`/brief?w=${b.week}`} aria-current={b.id === cur?.id ? "page" : undefined}><span>{b.week} 周</span><span className="faint">{b.engine === "ai" ? "AI" : "统计"}{b.sent_at ? " · 已发" : ""}</span></Link></li>
              ))}
            </ul>
          ) : <div className="empty sm-empty"><p>还没有</p></div>}
        </section>
        <section className="box">
          {cur ? (
            <>
              <div className="box-h">
                <h2>{cur.week} 周 · 需求雷达 <span className="c">{cur.engine === "ai" ? "Claude 撰写" : "统计版"} · 生成于 {fmtDate(cur.created_at)}{cur.sent_at ? ` · 已发送 ${fmtDate(cur.sent_at)}` : ""}</span></h2>
                <ActionButton action={sendBriefNow.bind(null, cur.id)}><Icon name="send" />发到群里</ActionButton>
              </div>
              {aiError ? <div className="note warn" style={{ margin: "12px 16px 0" }}>AI 撰写失败，显示的是统计版：{aiError}</div> : null}
              <div className="dg"><Markdown text={cur.body} /></div>
            </>
          ) : (
            <Empty title="还没有周报">点右上角「生成本周简报」。数据越多越有用：建议先跑几天抓取。</Empty>
          )}
        </section>
      </div>
    </>
  );
}
