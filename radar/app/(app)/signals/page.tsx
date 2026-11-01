import Link from "next/link";
import { q } from "@/lib/db";
import { listSignals, type Filters } from "@/lib/signals";
import { CATEGORY_LABEL, CHANNEL_META, INTENT_LABEL } from "@/lib/taxonomy";
import { minRelevance, topicMeta } from "@/lib/trends";
import { SignalList } from "@/components/signal";
import { Empty, Icon } from "@/components/ui";

export const metadata = { title: "信号" };

type SP = Record<string, string | undefined>;
const PAGE = 40;

export default async function Signals({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const f: Filters = {
    q: sp.q?.trim() || undefined,
    channel: sp.channel || undefined,
    topic: sp.topic || undefined,
    category: sp.category || undefined,
    intent: sp.intent || undefined,
    org: sp.org || undefined,
    source: sp.source ? Number(sp.source) : undefined,
    starred: sp.starred === "1",
    dismissed: sp.hidden === "1",
    days: sp.days ? Number(sp.days) : undefined,
    min: sp.min !== undefined && sp.min !== "" ? Number(sp.min) : undefined,
    listing: sp.listing === "only" || sp.listing === "exclude" ? sp.listing : "",
    sort: sp.sort === "relevance" || sp.sort === "hot" ? sp.sort : "new",
    limit: PAGE,
    offset: (page - 1) * PAGE,
  };
  const [{ rows, total }, meta, themes, sources, rel] = await Promise.all([
    listSignals(f),
    topicMeta(),
    q<{ id: number; title: string }>("select id, title from rd_themes where status <> 'parked' order by updated_at desc limit 30"),
    f.source ? q<{ name: string }>("select name from rd_sources where id = $1", [f.source]) : Promise.resolve([]),
    minRelevance(),
  ]);
  const href = (patch: SP) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return `/signals${s ? `?${s}` : ""}`;
  };
  const topics = Object.values(meta);
  const title = f.starred ? "标星的信号" : f.dismissed ? "已隐藏的信号" : f.topic ? `信号 · ${meta[f.topic]?.label ?? f.topic}` : f.org ? `信号 · ${f.org}` : sources[0] ? `信号 · ${sources[0].name}` : "信号";

  return (
    <>
      <div className="ph">
        <div>
          <h1>{title}</h1>
          <p>所有渠道汇在一起。默认只显示相关度 ≥ {rel} 的（设置里可改）；标星的会优先写进周报，「不相关」的会被隐藏。</p>
        </div>
        <a className="btn" href={`/api/export?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`}><Icon name="download" />导出 CSV</a>
      </div>

      <section className="box">
        <form className="fbar" action="/signals">
          <label className="ob-search"><Icon name="search" className="i sm" /><input name="q" defaultValue={f.q} placeholder="搜索标题、内容、公司…" /></label>
          <select className="select" name="channel" defaultValue={f.channel ?? ""}>
            <option value="">全部渠道</option>
            {Object.entries(CHANNEL_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select className="select" name="topic" defaultValue={f.topic ?? ""}>
            <option value="">全部主题</option>
            <optgroup label="数据形态">{topics.filter((t) => t.grp === "format").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
            <optgroup label="领域">{topics.filter((t) => t.grp === "domain").map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
          </select>
          <select className="select" name="intent" defaultValue={f.intent ?? ""}>
            <option value="">全部类型</option>
            {Object.entries(INTENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="select" name="category" defaultValue={f.category ?? ""}>
            <option value="">数据 + 环境 + 评测</option>
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="select" name="days" defaultValue={sp.days ?? ""}>
            <option value="">全部时间</option>
            <option value="1">24 小时</option>
            <option value="7">7 天</option>
            <option value="30">30 天</option>
            <option value="90">90 天</option>
          </select>
          <select className="select" name="sort" defaultValue={f.sort}>
            <option value="new">最新</option>
            <option value="relevance">最相关</option>
            <option value="hot">热度</option>
          </select>
          {f.org ? <input type="hidden" name="org" value={f.org} /> : null}
          {f.source ? <input type="hidden" name="source" value={f.source} /> : null}
          {f.starred ? <input type="hidden" name="starred" value="1" /> : null}
          <button className="btn sm pri" type="submit">筛选</button>
          <Link className="btn sm ghost" href="/signals">清空</Link>
        </form>
        <div className="tabs" role="tablist">
          <Link href={href({ listing: undefined, intent: undefined })} aria-selected={!f.listing && !f.intent}>全部 <span className="n">{!f.listing && !f.intent ? total : ""}</span></Link>
          <Link href={href({ intent: "demand", listing: undefined })} aria-selected={f.intent === "demand"}>明确需求</Link>
          <Link href={href({ listing: "exclude", intent: undefined })} aria-selected={f.listing === "exclude"}>不含岗位</Link>
          <Link href={href({ listing: "only", intent: undefined })} aria-selected={f.listing === "only"}>只看在招岗位</Link>
          <Link href={href({ starred: f.starred ? undefined : "1" })} aria-selected={f.starred}>★ 标星</Link>
          <Link href={href({ hidden: f.dismissed ? undefined : "1" })} aria-selected={f.dismissed}>已隐藏</Link>
        </div>
        {rows.length ? <SignalList rows={rows} meta={meta} themes={themes} /> : (
          <Empty title="没有符合条件的信号">换个筛选条件，或者在「渠道」页立即抓取一次。相关度阈值可以在设置里调低。</Empty>
        )}
        {total > PAGE ? (
          <div className="pager">
            <span className="muted">共 {total} 条 · 第 {page} / {Math.ceil(total / PAGE)} 页</span>
            <span className="row">
              {page > 1 ? <Link className="btn sm" href={href({ page: String(page - 1) })}>上一页</Link> : null}
              {page * PAGE < total ? <Link className="btn sm" href={href({ page: String(page + 1) })}>下一页</Link> : null}
            </span>
          </div>
        ) : null}
      </section>
    </>
  );
}
