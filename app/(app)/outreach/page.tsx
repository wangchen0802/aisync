import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listMembers } from "@/lib/core";
import {
  activeRound, followUps, investorAccess, listContacts, listRounds, pipelineCounts, recentTouches, roundStats, visiblePipelines,
} from "@/lib/outreach";
import { fmtMoney, PIPELINES, pipelineOf, stagesOf, touchLabel, type Pipeline } from "@/lib/outreach-meta";
import { ago, dayDiff, todayISO } from "@/lib/meta";
import { Heat, ImportButton, LogTouchButton, NewContactButton, OutreachView, RoundButton } from "@/components/outreach-client";
import { Avatar, DueChip, Icon } from "@/components/ui";

export const metadata = { title: "融资与外联" };

export default async function Outreach({ searchParams }: { searchParams: Promise<{ p?: string; v?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const allowed = await visiblePipelines(me);
  const pipeline: Pipeline = allowed.includes(sp.p as Pipeline) ? (sp.p as Pipeline) : allowed[0];
  const view = sp.v === "list" ? "list" : "board";
  const today = todayISO();
  const [contacts, rounds, members, recent, counts, access] = await Promise.all([
    listContacts(pipeline), listRounds(), listMembers(), recentTouches(pipeline, 8), pipelineCounts(allowed), investorAccess(),
  ]);
  const round = pipeline === "investor" ? await activeRound() : null;
  const currency = round?.currency ?? "USD";
  const meta = pipelineOf(pipeline);
  const team = members.filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));
  const todo = followUps(contacts, today);
  const active = contacts.filter((c) => { const st = stagesOf(pipeline); const i = st.findIndex((s) => s.key === c.stage); return i > 0 && i < st.length - 1; });
  const qs = (p: string, v = view) => `/outreach?p=${p}${v === "list" ? "&v=list" : ""}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{pipeline === "investor" ? `融资${round ? ` · ${round.name}` : ""}` : `外联 · ${meta.label}`}</h1>
          <p className="ph-meta">
            <span>{contacts.length} 个{meta.noun}</span>
            <span>推进中 {active.length}</span>
            {todo.length ? <span className="hot">要跟进 {todo.length}</span> : null}
            {pipeline === "investor" && access === "admins" ? <span><Icon name="lock" className="i sm" style={{ verticalAlign: -2 }} /> 仅管理员可见</span> : null}
          </p>
        </div>
        <div className="row">
          {pipeline === "investor" ? <RoundButton round={round} access={access} isAdmin={me.role === "admin"} /> : null}
          <ImportButton pipeline={pipeline} />
          <a className="btn" href={`/api/outreach/export?p=${pipeline}`} download><Icon name="download" />导出</a>
          <NewContactButton pipeline={pipeline} members={team} rounds={rounds} meId={me.id} label={`添加${meta.noun}`} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="seg views" role="tablist" aria-label="管道">
          {PIPELINES.filter((p) => allowed.includes(p.key)).map((p) => (
            <Link key={p.key} href={qs(p.key)} role="tab" className="seg-link" aria-selected={p.key === pipeline} aria-pressed={p.key === pipeline}>
              {p.label}<span className="mono faint" style={{ fontSize: 11 }}>{counts[p.key] ?? 0}</span>
            </Link>
          ))}
        </div>
        <div className="seg views" role="tablist" aria-label="视图">
          <Link href={qs(pipeline, "board")} className="seg-link" role="tab" aria-selected={view === "board"} aria-pressed={view === "board"}><Icon name="task" className="i sm" />看板</Link>
          <Link href={qs(pipeline, "list")} className="seg-link" role="tab" aria-selected={view === "list"} aria-pressed={view === "list"}><Icon name="menu" className="i sm" />列表</Link>
        </div>
      </div>

      {pipeline === "investor" ? <RoundPanel contacts={contacts} round={round} today={today} /> : null}

      {contacts.length ? (
        <div className="ov ov-even">
          <section className="box">
            <div className="box-h"><h2>要跟进 <span className="c">{todo.length}</span></h2><span className="muted" style={{ fontSize: 12 }}>2 天内到期，或 14 天没联系</span></div>
            {todo.length ? (
              <ul className="fu">
                {todo.slice(0, 8).map(({ c, why }) => (
                  <li key={c.id}>
                    <Heat h={c.heat} />
                    <div className="fu-b">
                      <Link href={`/outreach/${c.id}`}><b>{c.org || c.name}</b>{c.org && c.name ? <span className="muted"> · {c.name}</span> : null}</Link>
                      <span className="muted sm">{why === "due" ? c.next_step || "跟进" : `${dayDiff(today, (c.last_touch_at ?? c.created_at).slice(0, 10))} 天没联系`}</span>
                    </div>
                    {why === "due" ? <DueChip date={c.next_date} status="todo" today={today} /> : null}
                    <Avatar id={c.owner_id} name={c.owner_name} />
                    <LogTouchButton c={c} />
                  </li>
                ))}
              </ul>
            ) : <div className="empty sm-empty"><p>都跟进过了</p></div>}
          </section>
          <section className="box">
            <div className="box-h"><h2>最近进展</h2></div>
            {recent.length ? (
              <ul className="since-list">
                {recent.map((t) => (
                  <li key={t.id}>
                    <Avatar id={t.user_id} name={t.user_name} />
                    <span className="since-t">
                      <b>{t.user_name}</b> <Link className="link" href={`/outreach/${t.contact_id}`}>{t.org || t.name}</Link>
                      <span className="muted"> · {touchLabel(t.kind)}{t.body ? `：${t.body.slice(0, 60)}` : ""}</span>
                    </span>
                    <span className="muted since-ago">{ago(t.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="empty sm-empty"><p>记录第一次沟通后，这里会显示全队的进展</p></div>}
          </section>
        </div>
      ) : null}

      {contacts.length ? (
        <OutreachView contacts={contacts} pipeline={pipeline} view={view} meId={me.id} currency={currency} />
      ) : (
        <div className="box empty" style={{ padding: "48px 20px" }}>
          <b>还没有{meta.noun}</b>
          <p>{pipeline === "investor" ? "把目标投资人名单导进来，按阶段推进。每次沟通记一笔，全队都知道进展。" : `把${meta.noun}名单导进来，按阶段推进。`}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <ImportButton pipeline={pipeline} />
            <NewContactButton pipeline={pipeline} members={team} rounds={rounds} meId={me.id} label={`添加${meta.noun}`} />
          </div>
        </div>
      )}
    </>
  );
}

function RoundPanel({ contacts, round, today }: { contacts: Awaited<ReturnType<typeof listContacts>>; round: Awaited<ReturnType<typeof activeRound>>; today: string }) {
  const cur = round?.currency ?? "USD";
  const s = roundStats(contacts, round);
  const target = s.target || Math.max(s.closed + s.committed + s.termSheet, 1);
  const pct = (n: number) => `${Math.min(100, (n / target) * 100)}%`;
  const secured = s.closed + s.committed;
  const days = round?.close_date ? dayDiff(round.close_date, today) : null;
  const st = stagesOf("investor");
  const funnel = [
    { label: "已联系", n: contacts.filter((c) => c.stage !== "target").length },
    { label: "见面", n: contacts.filter((c) => st.findIndex((x) => x.key === c.stage) >= 2 && c.stage !== "passed").length },
    { label: "尽调", n: contacts.filter((c) => st.findIndex((x) => x.key === c.stage) >= 3 && c.stage !== "passed").length },
    { label: "条款", n: contacts.filter((c) => st.findIndex((x) => x.key === c.stage) >= 4 && c.stage !== "passed").length },
    { label: "承诺", n: contacts.filter((c) => c.stage === "committed" || c.stage === "closed").length },
  ];
  const top = Math.max(1, funnel[0].n);
  return (
    <section className="box rd">
      <div className="rd-main">
        <div className="rd-head">
          <span className="muted">{round ? [round.instrument, round.valuation].filter(Boolean).join(" · ") || "本轮" : "还没设置轮次"}</span>
          {days != null ? <span className={days < 0 ? "bad" : days <= 14 ? "hot" : "muted"}>{days < 0 ? `关账已过 ${-days} 天` : `距关账 ${days} 天`}</span> : null}
        </div>
        <div className="rd-big">
          <b>{fmtMoney(secured, cur)}</b>
          <span className="muted">{s.target ? <>/ {fmtMoney(s.target, cur)} · <span className="mono">{Math.round((secured / s.target) * 100)}%</span></> : "已承诺"}</span>
        </div>
        <div className="rd-bar" role="img" aria-label={`已到账 ${fmtMoney(s.closed, cur)}，已承诺 ${fmtMoney(s.committed, cur)}，谈条款 ${fmtMoney(s.termSheet, cur)}，目标 ${fmtMoney(s.target, cur)}`}>
          <span className="b-closed" style={{ width: pct(s.closed) }} />
          <span className="b-committed" style={{ width: pct(s.committed) }} />
          <span className="b-ts" style={{ width: pct(s.termSheet) }} />
        </div>
        <div className="rd-legend">
          <span><i className="b-closed" />已到账 <b className="mono">{fmtMoney(s.closed, cur)}</b></span>
          <span><i className="b-committed" />已承诺 <b className="mono">{fmtMoney(s.committed, cur)}</b></span>
          <span><i className="b-ts" />谈条款 <b className="mono">{fmtMoney(s.termSheet, cur)}</b></span>
          <span title="每个投资人的预期金额 × 所处阶段的成功概率">加权管道 <b className="mono">{fmtMoney(s.weighted, cur)}</b></span>
        </div>
      </div>
      <div className="rd-funnel" aria-label="漏斗">
        {funnel.map((f, i) => (
          <div key={f.label} className="fn">
            <span className="fn-l">{f.label}</span>
            <span className="fn-t"><span style={{ width: `${(f.n / top) * 100}%` }} /></span>
            <span className="fn-n mono">{f.n}</span>
            <span className="fn-c mono faint">{i && funnel[i - 1].n ? `${Math.round((f.n / funnel[i - 1].n) * 100)}%` : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
