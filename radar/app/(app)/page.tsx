import Link from "next/link";
import { aiEnabled } from "@/lib/ai";
import { classifyNow, runAllNow } from "@/lib/actions";
import { q } from "@/lib/db";
import { listSignals } from "@/lib/signals";
import { buyerMentions, overview, recentChanges, topicMeta, topicTrends } from "@/lib/trends";
import { ActionButton } from "@/components/client";
import { SignalList } from "@/components/signal";
import { ChangeList } from "@/components/changes";
import { Delta, HBars, Icon, Spark, timeAgo } from "@/components/ui";

export const metadata = { title: "总览" };

export default async function Home() {
  const [ov, trends, buyers, changes, demand, top, meta, themes, [src]] = await Promise.all([
    overview(),
    topicTrends(),
    buyerMentions(30),
    recentChanges(10, ["opened", "closed", "pay_changed", "reopened", "page_changed"]),
    listSignals({ intent: "demand", days: 14, limit: 5 }),
    listSignals({ days: 7, sort: "relevance", listing: "exclude", limit: 8 }),
    topicMeta(),
    q<{ id: number; title: string }>("select id, title from rd_themes where status <> 'parked' order by updated_at desc limit 30"),
    q<{ last: string | null; total: number; signals: number }>(
      "select max(last_run_at) as last, count(*) filter (where kind <> 'manual')::int as total, (select count(*)::int from rd_signals) as signals from rd_sources where enabled",
    ),
  ]);
  const rising = trends.filter((t) => t.now > 0).sort((a, b) => b.score - a.score || b.now - a.now).slice(0, 8);
  const empty = src.signals === 0;
  const topDemand = demand.rows.filter((r) => !top.rows.some((t) => t.id === r.id));

  return (
    <>
      <div className="ph">
        <div>
          <h1>总览</h1>
          <p className="ph-meta">
            <span>上次抓取 {timeAgo(src.last)}</span>
            <span>{ov.sources} 个渠道在跑</span>
            {ov.failing ? <span className="bad"><Link href="/sources">{ov.failing} 个渠道出错</Link></span> : null}
            {aiEnabled() && ov.unclassified ? <span>{ov.unclassified} 条等待 AI 分类</span> : null}
          </p>
        </div>
        <div className="row">
          {aiEnabled() && ov.unclassified ? <ActionButton className="btn" action={classifyNow} pendingText="分类中…"><Icon name="bolt" />AI 分类</ActionButton> : null}
          <ActionButton className="btn pri" action={runAllNow} pendingText="正在抓取（最多几分钟）…"><Icon name="play" />立即抓取</ActionButton>
        </div>
      </div>

      {empty ? (
        <div className="setup">
          <b>开始</b>
          <span className="setup-step"><span className="ck">1</span>点右上角「立即抓取」，第一次会导入各招聘页的全部在招岗位</span>
          <Link className="setup-step" href="/sources"><span className="ck">2</span>在「渠道」里加你们关心的公司和关键词</Link>
          <Link className="setup-step" href="/settings#notify"><span className="ck">3</span>配置 Lark 群通知</Link>
          <Link className="setup-step" href="/settings#capture"><span className="ck">4</span>装「收录」书签，X / LinkedIn 一键收</Link>
        </div>
      ) : null}

      <div className="kpis">
        <div className="box kpi">
          <span className="l">新的相关信号 · 7 天</span>
          <span className="v">{ov.newSignals}</span>
          <Spark values={ov.weekly} label={`近 12 周每周信号数：${ov.weekly.join("、")}`} />
          <span className="d">前一周 <b>{ov.newSignalsPrev}</b></span>
        </div>
        <Link className="box kpi" href="/signals?intent=demand">
          <span className="l">明确的需求 · 7 天</span>
          <span className="v">{ov.demand}</span>
          <span className="d">前一周 <b>{ov.demandPrev}</b> · 有人公开在找数据 / 环境</span>
        </Link>
        <Link className="box kpi" href="/listings">
          <span className="l">跟踪中的在招岗位</span>
          <span className="v">{ov.openListings}<small>专家岗 {ov.openExpert}</small></span>
          <span className="d">数据商 + 实验室招聘页</span>
        </Link>
        <Link className="box kpi" href="/listings#changes">
          <span className="l">岗位变化 · 7 天</span>
          <span className="v">+{ov.opened}<small>−{ov.closed}</small></span>
          <span className="d">新增 / 下架</span>
        </Link>
        <div className="box kpi">
          <span className="l">在招岗位时薪中位数</span>
          <span className="v">{ov.medianHourly ? `$${ov.medianHourly}` : "—"}<small>/小时</small></span>
          <span className="d"><Link href="/trends#pay">按领域看 →</Link></span>
        </div>
      </div>

      <div className="ov">
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>升温的需求方向 <span className="c">本周 vs 前 4 周平均</span></h2><Link className="link" href="/trends">全部趋势 <Icon name="arrow" className="i sm" /></Link></div>
            {rising.length ? rising.map((t) => (
              <div className="trow" key={t.key}>
                <div className="nm">
                  <Link href={`/signals?topic=${t.key}`}>{t.label}</Link>
                  <small>{t.grp === "format" ? "数据形态" : "领域"} · 本周 {t.now} · 基线 {t.base.toFixed(1)}</small>
                </div>
                <Spark values={t.series} label={`${t.label} 近 12 周：${t.series.join("、")}`} />
                <Delta now={t.now} base={t.base} />
              </div>
            )) : <div className="empty sm-empty"><p>还没有足够的数据。抓取几天后这里会显示哪些方向在升温。</p></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>明确的需求 <span className="c">14 天</span></h2><Link className="link" href="/signals?intent=demand">全部 <Icon name="arrow" className="i sm" /></Link></div>
            {topDemand.length ? <SignalList rows={topDemand} meta={meta} themes={themes} /> : <div className="empty sm-empty"><p>还没有人公开说「我们在找…」。看到客户询价、群里求购，用右上角「收录信号」记下来。</p></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>本周高相关信号</h2><Link className="link" href="/signals?sort=relevance&days=7">全部 <Icon name="arrow" className="i sm" /></Link></div>
            {top.rows.length ? <SignalList rows={top.rows} meta={meta} themes={themes} /> : <div className="empty sm-empty"><p>本周还没有新的高相关信号。</p></div>}
          </section>
        </div>

        <div className="col">
          <section className="box">
            <div className="box-h"><h2>岗位变化</h2><Link className="link" href="/listings#changes">全部 <Icon name="arrow" className="i sm" /></Link></div>
            <ChangeList rows={changes} />
          </section>
          <section className="box">
            <div className="box-h"><h2>被提到的实验室 <span className="c">30 天</span></h2></div>
            {buyers.length ? (
              <>
                <HBars rows={buyers.slice(0, 10).map((b) => ({ name: b.name, value: b.now, prev: b.prev, href: `/signals?org=${encodeURIComponent(b.name)}` }))} prevLabel="前 30 天" />
                <div className="legend-line"><span><i />最近 30 天</span><span><i className="tick" />前 30 天</span></div>
              </>
            ) : <div className="empty sm-empty"><p>暂无（不含实验室自己的招聘页）。</p></div>}
          </section>
        </div>
      </div>
    </>
  );
}
