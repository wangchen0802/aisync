import Link from "next/link";
import { q } from "@/lib/db";
import { topicMeta, topicTrends } from "@/lib/trends";
import { THEME_STATUS, ThemeCreate } from "@/components/themes";
import { Empty, Spark, timeAgo, TopicChips } from "@/components/ui";

export const metadata = { title: "需求假设" };

type Row = { id: number; title: string; thesis: string; status: string; topics: string[]; next_step: string; updated_at: string; owner: string | null; evidence: number; notes: number; fresh: number };

export default async function Themes() {
  const [rows, meta, trends] = await Promise.all([
    q<Row>(
      `select t.id, t.title, t.thesis, t.status, t.topics, t.next_step, t.updated_at, u.name as owner,
         (select count(*)::int from rd_theme_signals ts where ts.theme_id = t.id) as evidence,
         (select count(*)::int from rd_notes n where n.theme_id = t.id) as notes,
         (select count(*)::int from rd_theme_signals ts join rd_signals s on s.id = ts.signal_id where ts.theme_id = t.id and s.first_seen_at > now() - interval '7 days') as fresh
       from rd_themes t left join rd_users u on u.id = t.owner_id
       order by case t.status when 'building' then 0 when 'validating' then 1 when 'watching' then 2 else 3 end, t.updated_at desc`,
    ),
    topicMeta(),
    topicTrends(),
  ]);
  const series = (keys: string[]) => {
    const arr = Array(12).fill(0);
    for (const t of trends.filter((x) => keys.includes(x.key))) t.series.forEach((v, i) => (arr[i] += v));
    return arr;
  };
  const topics = Object.values(meta).map((t) => ({ key: t.key, label: t.label, grp: t.grp }));
  return (
    <>
      <div className="ph">
        <div>
          <h1>需求假设</h1>
          <p>团队一起想的地方：把「我们觉得 X 类数据 / 环境需求在涨」写成一个假设，挂上信号做证据，讨论、验证，然后决定做不做。</p>
        </div>
        <ThemeCreate topics={topics} />
      </div>
      {rows.length ? (
        <div className="th-grid">
          {rows.map((t) => {
            const s = series(t.topics);
            return (
              <article key={t.id} className="box th">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className={`ths ths-${t.status}`}>{THEME_STATUS[t.status] ?? t.status}</span>
                  <span className="faint" style={{ fontSize: 11.5 }}>{timeAgo(t.updated_at)}{t.owner ? ` · ${t.owner}` : ""}</span>
                </div>
                <h3><Link href={`/themes/${t.id}`}>{t.title}</Link></h3>
                {t.thesis ? <p>{t.thesis}</p> : null}
                {t.topics.length ? <Spark values={s} label={`相关方向近 12 周信号数：${s.join("、")}`} /> : null}
                <div className="row" style={{ gap: 6 }}><TopicChips keys={t.topics} meta={meta} /></div>
                <div className="meta">
                  <span><b>{t.evidence}</b> 条证据{t.fresh ? `（本周 +${t.fresh}）` : ""}</span>
                  <span><b>{t.notes}</b> 条讨论</span>
                </div>
                {t.next_step ? <div className="note" style={{ padding: "6px 10px" }}>下一步：{t.next_step}</div> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="box">
          <Empty title="还没有需求假设">
            从一个你们已经在想的判断开始，比如「编程类 RL 环境需求在上升」「医疗专家数据的时薪在涨」。也可以在任意信号上点 💡 直接新建。
          </Empty>
        </section>
      )}
    </>
  );
}
