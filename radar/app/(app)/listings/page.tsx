import Link from "next/link";
import { q } from "@/lib/db";
import { listSignals } from "@/lib/signals";
import { ORG_TYPE_LABEL } from "@/lib/taxonomy";
import { boards, recentChanges, topicMeta } from "@/lib/trends";
import { ChangeList } from "@/components/changes";
import { SignalList } from "@/components/signal";
import { Empty, Icon, timeAgo } from "@/components/ui";

export const metadata = { title: "岗位追踪" };

const TYPES: Record<string, string[]> = { all: ["opened", "closed", "pay_changed", "reopened"], opened: ["opened", "reopened"], closed: ["closed"], pay: ["pay_changed"] };

export default async function Listings({ searchParams }: { searchParams: Promise<{ c?: string; board?: string; who?: string }> }) {
  const sp = await searchParams;
  const tab = sp.c && TYPES[sp.c] ? sp.c : "all";
  const who = sp.who === "all" ? "" : "expert";
  const board = sp.board ? Number(sp.board) : undefined;
  const [bds, changes, open, meta, themes] = await Promise.all([
    boards(),
    recentChanges(60, TYPES[tab], 30),
    listSignals({ listing: "only", subtype: who || undefined, source: board, sort: "new", limit: 40, min: 0 }),
    topicMeta(),
    q<{ id: number; title: string }>("select id, title from rd_themes where status <> 'parked' order by updated_at desc limit 30"),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/listings${u.size ? `?${u}` : ""}`;
  };
  return (
    <>
      <div className="ph">
        <div>
          <h1>岗位追踪</h1>
          <p>数据商的专家岗位是「实验室正在买什么」最直接的公开信号；实验室自己的 Human Data / RL 环境岗位说明它们在加大投入。每次抓取对比上一次：新增、下架、薪资变化。</p>
        </div>
        <Link className="btn" href="/sources#add"><Icon name="plus" />添加招聘页</Link>
      </div>

      <section className="box">
        <div className="box-h"><h2>招聘页</h2><span className="c">{bds.length} 个</span></div>
        {bds.length ? (
          <div className="ot-wrap">
            <table className="ot">
              <thead>
                <tr>
                  <th><button>公司</button></th><th className="hide-m"><button>类型</button></th>
                  <th className="num"><button>在招</button></th><th className="num"><button>专家岗</button></th>
                  <th className="num"><button>7 天新增</button></th><th className="num"><button>7 天下架</button></th>
                  <th className="num hide-m"><button>30 天新增</button></th>
                  <th className="num"><button>时薪中位</button></th><th className="num hide-m"><button>最高</button></th>
                  <th className="hide-m"><button>更新</button></th>
                </tr>
              </thead>
              <tbody>
                {bds.map((b) => (
                  <tr key={b.source_id}>
                    <td><Link href={qs({ board: String(b.source_id), who: "all" })} style={{ fontWeight: 500 }}>{b.org}</Link>{b.last_error ? <span className="src-err" title={b.last_error}>{b.last_error}</span> : null}</td>
                    <td className="hide-m muted">{ORG_TYPE_LABEL[b.org_type] ?? "—"}</td>
                    <td className="num mono">{b.open}</td>
                    <td className="num mono">{b.expert || "—"}</td>
                    <td className="num mono">{b.opened7 ? `+${b.opened7}` : "—"}</td>
                    <td className="num mono">{b.closed7 ? `−${b.closed7}` : "—"}</td>
                    <td className="num mono hide-m">{b.opened30 || "—"}</td>
                    <td className="num mono">{b.median_hr ? `$${b.median_hr}` : "—"}</td>
                    <td className="num mono hide-m">{b.max_hr ? `$${b.max_hr}` : "—"}</td>
                    <td className="hide-m muted" style={{ fontSize: 12 }}>{timeAgo(b.last_ok_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="还没有招聘页">在「渠道」里添加 Greenhouse / Lever / Ashby 招聘页。</Empty>}
      </section>

      <div className="ov">
        <section className="box">
          <div className="box-h">
            <h2>{board ? `${bds.find((b) => b.source_id === board)?.org ?? ""} 在招岗位` : who ? "在招的专家 / 标注岗位" : "全部在招岗位"} <span className="c">{open.total}</span></h2>
            <div className="seg">
              <Link className="seg-link" href={qs({ who: undefined })} aria-pressed={who === "expert"}>专家岗</Link>
              <Link className="seg-link" href={qs({ who: "all" })} aria-pressed={!who}>全部</Link>
              {board ? <Link className="seg-link" href={qs({ board: undefined })}>所有公司</Link> : null}
            </div>
          </div>
          {open.rows.length ? <SignalList rows={open.rows} meta={meta} themes={themes} /> : <Empty title="没有">这里会列出标题像「专家 / AI Trainer / Contractor」的岗位。</Empty>}
          {open.total > open.rows.length ? <div className="pager"><span className="muted">显示最新 {open.rows.length} 条</span><Link className="btn sm" href={`/signals?listing=only${board ? `&source=${board}` : ""}`}>在信号页查看全部</Link></div> : null}
        </section>
        <section className="box" id="changes">
          <div className="box-h"><h2>变化 <span className="c">30 天</span></h2></div>
          <div className="tabs">
            {[["all", "全部"], ["opened", "新增"], ["closed", "下架"], ["pay", "薪资"]].map(([k, l]) => (
              <Link key={k} href={qs({ c: k === "all" ? undefined : k }) + "#changes"} aria-selected={tab === k}>{l}</Link>
            ))}
          </div>
          <ChangeList rows={changes} />
        </section>
      </div>
    </>
  );
}
