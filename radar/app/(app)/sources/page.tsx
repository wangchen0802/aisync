import Link from "next/link";
import { aiEnabled } from "@/lib/ai";
import { runAllNow } from "@/lib/actions";
import { CHANNEL_MAP, PRESETS, STATUS_LABEL } from "@/lib/catalog";
import { COLLECTORS, missingEnv } from "@/lib/collectors";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { list } from "@/lib/text";
import { ActionButton } from "@/components/client";
import { PresetButtons, SourceActions, SourceForm, type DefView } from "@/components/sources";
import { ChannelBadge, Icon, timeAgo } from "@/components/ui";

export const metadata = { title: "渠道" };

type Src = { id: number; kind: string; name: string; config: Record<string, unknown>; enabled: boolean; every_hours: number; state: Record<string, unknown>; last_run_at: string | null; last_ok_at: string | null; last_error: string | null; last_found: number; last_new: number; signals: number; week: number };

function summary(s: Src) {
  const c = s.config;
  const bits = [c.board, c.company, c.subreddit && `r/${c.subreddit}`, c.query, c.url, c.search, c.author && `@${c.author}`].filter(Boolean).map((x) => (Array.isArray(x) ? x.join(", ") : String(x)));
  const inc = list(c.include);
  if (inc.length) bits.push(`只保留：${inc.slice(0, 4).join(", ")}${inc.length > 4 ? "…" : ""}`);
  return bits.join(" · ");
}

export default async function Sources() {
  const [sources, labels] = await Promise.all([
    q<Src>(
      `select src.*, (select count(*)::int from rd_signals s where s.source_id = src.id) as signals,
         (select count(*)::int from rd_signals s where s.source_id = src.id and s.first_seen_at > now() - interval '7 days') as week
       from rd_sources src order by src.kind = 'manual' desc, src.enabled desc, src.id`,
    ),
    q<{ key: string; label: string }>("select key, label from rd_topics"),
  ]);
  const labelMap = Object.fromEntries(labels.map((l) => [l.key, l.label]));
  const defs: DefView[] = Object.values(COLLECTORS).map((d) => ({
    kind: d.kind, label: d.label, channel: d.channel, listing: d.listing, help: d.help, fields: d.fields,
    missing: missingEnv(d), optionalMissing: (d.needs ?? []).filter((n) => n.optional && !process.env[n.env]).map((n) => n.env),
  }));
  const added = new Set(sources.map((s) => String(s.state?.preset ?? "")));
  const creds: [string, boolean, string][] = [
    ["X_BEARER_TOKEN", Boolean(process.env.X_BEARER_TOKEN), "X 搜索"],
    ["REDDIT_CLIENT_ID / SECRET", Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), "Reddit 稳定访问"],
    ["GITHUB_TOKEN", Boolean(process.env.GITHUB_TOKEN), "GitHub 限额"],
    ["ANTHROPIC_API_KEY", aiEnabled(), "AI 分类和周报"],
    ["CRON_SECRET", Boolean(process.env.CRON_SECRET), "定时抓取"],
  ];

  return (
    <>
      <div className="ph">
        <div>
          <h1>渠道</h1>
          <p>每个渠道按自己的频率自动抓取。下面的「渠道地图」是我们一起想的：哪里能看到需求、接没接上、怎么接。</p>
        </div>
        <ActionButton className="btn pri" action={runAllNow} pendingText="抓取中（最多几分钟）…"><Icon name="play" />抓取所有到期渠道</ActionButton>
      </div>

      <div className="row" style={{ gap: 6 }}>
        {creds.map(([k, ok, what]) => <span key={k} className={`pill${ok ? " ok" : ""}`} title={what}>{ok ? "✓" : "○"} {k} · {what}</span>)}
      </div>

      <section className="box">
        <div className="box-h"><h2>已接入 <span className="c">{sources.filter((s) => s.enabled).length} / {sources.length}</span></h2></div>
        <div className="ot-wrap">
          <table className="ot">
            <thead><tr><th><button>渠道</button></th><th className="hide-m"><button>频率</button></th><th><button>上次运行</button></th><th className="num"><button>信号</button></th><th /></tr></thead>
            <tbody>
              {sources.map((s) => {
                const def = COLLECTORS[s.kind];
                const state = !s.enabled ? "off" : s.last_error ? "err" : s.last_ok_at ? "ok" : "wait";
                return (
                  <tr key={s.id} className="src-row">
                    <td style={{ maxWidth: 520 }}>
                      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                        <span className={`dot ${state}`} title={{ off: "已暂停", err: "出错", ok: "正常", wait: "还没运行" }[state]} />
                        <ChannelBadge channel={def?.channel ?? "manual"} label="" />
                        <Link className="name" href={`/signals?source=${s.id}`}>{s.name}</Link>
                      </div>
                      <small>{s.kind === "manual" ? "收录书签、手动粘贴、API / MCP 写入" : `${def?.label ?? s.kind} · ${summary(s)}`}</small>
                      {s.last_error ? <span className="src-err" title={s.last_error}>{s.last_error}</span> : null}
                    </td>
                    <td className="hide-m muted">{s.kind === "manual" ? "—" : s.every_hours >= 168 ? "每周" : s.every_hours >= 24 ? `${s.every_hours / 24} 天` : `${s.every_hours} 小时`}</td>
                    <td className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }} title={s.last_run_at ? fmtDate(s.last_run_at) : ""}>{s.kind === "manual" ? "—" : `${timeAgo(s.last_run_at)}${s.last_run_at && !s.last_error ? ` · ${s.last_found} 条 / 新 ${s.last_new}` : ""}`}</td>
                    <td className="num mono">{s.signals}{s.week ? <span className="faint"> +{s.week}</span> : null}</td>
                    <td><SourceActions source={{ id: s.id, kind: s.kind, name: s.name, every_hours: s.every_hours, enabled: s.enabled, config: s.config }} defs={defs} labels={labelMap} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="box" id="add">
        <div className="box-h"><h2>添加渠道</h2><span className="c">任意公司招聘页、版块、关键词、RSS、网页</span></div>
        <div className="pad"><SourceForm defs={defs} labels={labelMap} /></div>
      </section>

      <div className="ph" style={{ marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 19 }}>渠道地图</h1>
          <p>需求会在哪里露出来？自动 = 已能抓；需要 Key = 配好环境变量就能抓；手动收录 = 没有 API，看到就用书签收；待讨论 = 还没想好怎么接。想到新渠道，直接在上面「添加渠道」，或者告诉 Claude 一起加。</p>
        </div>
      </div>
      <div className="cmap">
        {CHANNEL_MAP.map((g) => (
          <section key={g.title} className="box cg">
            <h3>{g.title}</h3>
            <p>{g.why}</p>
            {g.ideas.map((idea) => (
              <div key={idea.title} className="ci2">
                <span className={`pill st-${idea.status}`}>{STATUS_LABEL[idea.status]}</span>
                <b>{idea.title}</b>
                <span className="how">{idea.how}</span>
                {idea.presets?.length ? (
                  <div className="acts" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    {idea.presets.map((pid) => {
                      const p = PRESETS.find((x) => x.id === pid);
                      if (!p) return null;
                      return (
                        <div key={pid} className="row" style={{ gap: 6 }}>
                          <span style={{ fontSize: 12, flex: 1, minWidth: 140 }}>{p.name}{p.verify ? <span className="faint">（待确认）</span> : null}</span>
                          <PresetButtons id={pid} added={added.has(pid)} verify={p.verify} labels={labelMap} />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
