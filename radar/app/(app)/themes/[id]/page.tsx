import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTheme, removeEvidence } from "@/lib/actions";
import { q } from "@/lib/db";
import { SIGNAL_COLS, type SignalRow } from "@/lib/signals";
import { minRelevance, topicMeta, topicTrends, TS } from "@/lib/trends";
import { ActionButton } from "@/components/client";
import { SignalList } from "@/components/signal";
import { NoteComposer, ThemeEditor } from "@/components/themes";
import { Delta, Empty, Icon, Spark, timeAgo } from "@/components/ui";

export default async function ThemePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [theme] = await q<{ id: number; title: string; thesis: string; status: string; next_step: string; topics: string[]; created_at: string }>(
    "select id, title, thesis, status, next_step, topics, created_at from rd_themes where id = $1",
    [id],
  );
  if (!theme) notFound();
  const rel = await minRelevance();
  const [evidence, suggested, notes, meta, trends, themes] = await Promise.all([
    q<SignalRow>(`select ${SIGNAL_COLS} from rd_theme_signals ts join rd_signals s on s.id = ts.signal_id join rd_sources src on src.id = s.source_id where ts.theme_id = $1 order by ${TS} desc`, [id]),
    theme.topics.length
      ? q<SignalRow>(
          `select ${SIGNAL_COLS} from rd_signals s join rd_sources src on src.id = s.source_id
           where s.topics && $2::text[] and not s.dismissed and s.relevance >= $3 and ${TS} > now() - interval '30 days'
             and not exists (select 1 from rd_theme_signals ts where ts.theme_id = $1 and ts.signal_id = s.id)
           order by (s.intent = 'demand') desc, cardinality(array(select unnest(s.topics) intersect select unnest($2::text[]))) desc, s.relevance desc limit 8`,
          [id, theme.topics, rel],
        )
      : Promise.resolve([] as SignalRow[]),
    q<{ id: number; body: string; created_at: string; name: string | null }>(
      "select n.id, n.body, n.created_at, u.name from rd_notes n left join rd_users u on u.id = n.user_id where n.theme_id = $1 order by n.created_at",
      [id],
    ),
    topicMeta(),
    topicTrends(),
    q<{ id: number; title: string }>("select id, title from rd_themes where status <> 'parked' order by updated_at desc limit 30"),
  ]);
  const topics = Object.values(meta).map((t) => ({ key: t.key, label: t.label, grp: t.grp }));
  const related = trends.filter((t) => theme.topics.includes(t.key));
  return (
    <>
      <Link className="back-link" href="/themes"><Icon name="back" className="i sm" />需求假设</Link>
      <div className="ov">
        <div className="col">
          <ThemeEditor theme={theme} topics={topics} />
          <section className="box">
            <div className="box-h"><h2>证据 <span className="c">{evidence.length}</span></h2></div>
            {evidence.length ? (
              <>
                <SignalList rows={evidence} meta={meta} themes={themes} />
                <div className="pad row" style={{ borderTop: "1px solid var(--line)", gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>移除：</span>
                  {evidence.map((e) => (
                    <ActionButton key={e.id} className="chip" action={removeEvidence.bind(null, id, e.id)}>#{e.id} ×</ActionButton>
                  ))}
                </div>
              </>
            ) : <Empty title="还没有证据">在信号上点 💡 加进来，或者从右边的推荐里挑。</Empty>}
          </section>
          <section className="box">
            <div className="box-h"><h2>讨论 <span className="c">{notes.length}</span></h2></div>
            {notes.length ? (
              <ul className="notes">
                {notes.map((n) => <li key={n.id}><span className="meta"><b>{n.name ?? "成员"}</b>{timeAgo(n.created_at)}</span><p>{n.body}</p></li>)}
              </ul>
            ) : null}
            <NoteComposer themeId={id} />
          </section>
        </div>
        <div className="col">
          {related.length ? (
            <section className="box">
              <div className="box-h"><h2>相关方向热度</h2></div>
              {related.map((t) => (
                <div className="trow" key={t.key}>
                  <div className="nm"><Link href={`/signals?topic=${t.key}`}>{t.label}</Link><small>本周 {t.now} · 基线 {t.base.toFixed(1)}</small></div>
                  <Spark values={t.series} label={`${t.label} 近 12 周：${t.series.join("、")}`} />
                  <Delta now={t.now} base={t.base} />
                </div>
              ))}
            </section>
          ) : null}
          <section className="box">
            <div className="box-h"><h2>可能的新证据 <span className="c">30 天 · 同方向</span></h2></div>
            {suggested.length ? <SignalList rows={suggested} meta={meta} themes={themes} /> : <Empty title="暂无">给假设选上相关方向，这里会推荐信号。</Empty>}
          </section>
          <div><ActionButton className="btn sm danger" action={deleteTheme.bind(null, id)} confirm="删除这个假设？证据信号会保留">删除假设</ActionButton></div>
        </div>
      </div>
    </>
  );
}
