import Link from "next/link";
import { CHANNEL_META } from "@/lib/taxonomy";
import { buyerMentions, channelMix, payByTopic, topicTrends, vendorMentions, WEEKS, type TopicTrend } from "@/lib/trends";
import { Delta, Empty, HBars } from "@/components/ui";

export const metadata = { title: "趋势" };

function weekLabel(i: number) {
  // window i (0 = oldest) ends (WEEKS-1-i)*7 days ago
  const end = new Date(Date.now() - (WEEKS - 1 - i) * 7 * 86400_000 + 8 * 3600_000);
  return `${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

function level(c: number, max: number) {
  if (!c) return 0;
  return Math.min(5, Math.max(1, Math.ceil(Math.sqrt(c / max) * 5)));
}

function HeatRows({ rows, max, title }: { rows: TopicTrend[]; max: number; title: string }) {
  return (
    <>
      <tr><th className="grp" colSpan={WEEKS + 4}>{title}</th></tr>
      {rows.map((t) => (
        <tr key={t.key}>
          <th className="rowh" scope="row"><Link href={`/signals?topic=${t.key}`}>{t.label}</Link></th>
          {t.series.map((c, i) => (
            <td key={i} className={`cell h${level(c, max)}`} data-tip={`${t.label}\n截至 ${weekLabel(i)} 的 7 天：${c} 条`} tabIndex={0}>{c}</td>
          ))}
          <td className="num"><b>{t.now}</b></td>
          <td className="num">{t.base.toFixed(1)}</td>
          <td className="num"><Delta now={t.now} base={t.base} /></td>
        </tr>
      ))}
    </>
  );
}

export default async function Trends() {
  const [trends, buyers, vendors, mix, pay] = await Promise.all([topicTrends(), buyerMentions(30), vendorMentions(30), channelMix(30), payByTopic()]);
  const active = trends.filter((t) => t.total > 0);
  const max = Math.max(1, ...active.flatMap((t) => t.series));
  const sortRows = (g: string) => active.filter((t) => t.grp === g).sort((a, b) => b.now - a.now || b.total - a.total);
  const payMax = Math.max(1, ...pay.map((p) => p.max));
  return (
    <>
      <div className="ph">
        <div>
          <h1>趋势</h1>
          <p>每一格 = 截至那天的 7 天里，提到这个方向的相关信号数（招聘页第一次导入的历史岗位按发布时间计入）。「本周」对比的是前 4 周平均。</p>
        </div>
      </div>

      <section className="box">
        <div className="box-h"><h2>方向 × 周</h2><span className="c">{active.length} 个方向有数据</span></div>
        {active.length ? (
          <>
            <div className="heat-wrap pad" style={{ paddingTop: 6 }}>
              <table className="heat">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: WEEKS }, (_, i) => <th key={i} scope="col">{i % 2 === (WEEKS - 1) % 2 ? weekLabel(i) : ""}</th>)}
                    <th scope="col" style={{ textAlign: "right" }}>本周</th>
                    <th scope="col" style={{ textAlign: "right" }}>基线</th>
                    <th scope="col" style={{ textAlign: "right" }}>变化</th>
                  </tr>
                </thead>
                <tbody>
                  <HeatRows rows={sortRows("format")} max={max} title="数据形态 · 买的是什么" />
                  <HeatRows rows={sortRows("domain")} max={max} title="领域 · 为了什么能力" />
                </tbody>
              </table>
            </div>
            <div className="heat-legend">
              <span>少</span><em />
              {[0, 1, 2, 3, 4, 5].map((l) => <span key={l} className={`h${l}`} />)}
              <em />多 · 单格最多 {max} 条
            </div>
          </>
        ) : <Empty title="还没有数据">抓取一次之后，这里会按周显示每个方向的热度。</Empty>}
      </section>

      <div className="two">
        <section className="box">
          <div className="box-h"><h2>被提到的实验室 <span className="c">买方 · 30 天</span></h2></div>
          {buyers.length ? (
            <>
              <HBars rows={buyers.map((b) => ({ name: b.name, value: b.now, prev: b.prev, href: `/signals?org=${encodeURIComponent(b.name)}` }))} prevLabel="前 30 天" />
              <div className="legend-line"><span><i />最近 30 天</span><span><i className="tick" />前 30 天</span><span>不含实验室自己的招聘页</span></div>
            </>
          ) : <Empty title="暂无" />}
        </section>
        <section className="box">
          <div className="box-h"><h2>被提到的数据商 / 环境公司 <span className="c">30 天</span></h2></div>
          {vendors.length ? (
            <>
              <HBars rows={vendors.map((b) => ({ name: b.name, value: b.now, prev: b.prev, href: `/signals?org=${encodeURIComponent(b.name)}` }))} prevLabel="前 30 天" />
              <div className="legend-line"><span><i />最近 30 天</span><span><i className="tick" />前 30 天</span><span>不含它们自己的岗位</span></div>
            </>
          ) : <Empty title="暂无" />}
        </section>
      </div>

      <div className="two">
        <section className="box" id="pay">
          <div className="box-h"><h2>在招岗位时薪 · 按方向</h2><span className="c">$/小时 · 25–75 分位，竖线为中位数</span></div>
          {pay.length ? (
            <div className="pays">
              {pay.map((p) => (
                <div className="pr2" key={p.key}>
                  <span><Link href={`/signals?topic=${p.key}&listing=only`}>{p.label}</Link> <span className="faint mono" style={{ fontSize: 11 }}>{p.n}</span></span>
                  <span className="tr" data-tip={`${p.label}（${p.n} 个岗位）\n25 分位 $${p.p25} · 中位 $${p.p50} · 75 分位 $${p.p75}\n最高 $${p.max}`} tabIndex={0}>
                    <span className="band" style={{ left: `${(p.p25 / payMax) * 100}%`, width: `${Math.max(1, ((p.p75 - p.p25) / payMax) * 100)}%` }} />
                    <span className="mid" style={{ left: `${(p.p50 / payMax) * 100}%` }} />
                  </span>
                  <span className="x">${p.p50} <span className="faint">≤${p.max}</span></span>
                </div>
              ))}
            </div>
          ) : <Empty title="还没有带时薪的岗位">数据商的专家岗位通常写明时薪；接入更多数据商招聘页后这里会有数据。</Empty>}
        </section>
        <section className="box">
          <div className="box-h"><h2>信号来自哪些渠道 <span className="c">30 天</span></h2></div>
          {mix.length ? <HBars rows={mix.map((m) => ({ name: CHANNEL_META[m.channel]?.label ?? m.channel, value: m.c, href: `/signals?channel=${m.channel}&days=30` }))} /> : <Empty title="暂无" />}
        </section>
      </div>
    </>
  );
}
