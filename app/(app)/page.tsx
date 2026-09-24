import Link from "next/link";
import { requireUser } from "@/lib/session";
import { q } from "@/lib/db";
import { goalPct, getSetting, listGoals, listItems, listMembers, listProjects, sinceLastVisit } from "@/lib/core";
import { agree, resolveConflict } from "@/lib/actions";
import { addDays, ago, code, progressOf, todayISO, weekStart } from "@/lib/meta";
import { ActionButton } from "@/components/client";
import { myFollowUps } from "@/lib/outreach";
import { Heat, LogTouchButton } from "@/components/outreach-client";
import { Avatar, DueChip, Icon, Progress, Source } from "@/components/ui";

export const metadata = { title: "总览" };

function greet() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Shanghai" }));
  return h < 6 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
}

type Change = { id: number; type: string; text: string; created_at: string; user_id: number; name: string; item_id: number | null; kind: string | null; title: string | null; conv_title: string | null };

export default async function Home() {
  const me = await requireUser();
  const today = todayISO();
  const [items, projects, members, since, goals, brief, follows] = await Promise.all([
    listItems(me.id, { limit: 600 }), listProjects(), listMembers(), sinceLastVisit(me.id), listGoals(me.id, weekStart(today)), getSetting("team_brief", ""),
    myFollowUps(me, addDays(today, 7)),
  ]);
  const changes = await q<Change>(
    `select e.id, e.type, e.text, e.created_at, e.user_id, u.name, e.item_id, i.kind, i.title, c.title as conv_title
     from events e join users u on u.id = e.user_id left join items i on i.id = e.item_id left join conversations c on c.id = e.conversation_id
     where e.created_at > $1 and e.user_id <> $2 and e.type in ('publish', 'confirm', 'conflict', 'comment', 'task_progress', 'create', 'object', 'goal')
       and (i.id is null or i.visibility = 'team')
     order by e.created_at desc limit 30`,
    [since, me.id],
  );

  const decisions = items.filter((i) => i.kind === "decision");
  const tasks = items.filter((i) => i.kind === "task");
  const byId = new Map(items.map((i) => [i.id, i]));
  const conflicts = decisions.filter((d) => d.status === "conflict");
  const awaiting = decisions.filter((d) => d.status === "discussing" && !d.acks.some((a) => a.user_id === me.id));
  const mine = tasks.filter((t) => t.assignee_id === me.id && t.status !== "done");
  const urgent = mine.filter((t) => t.due_date && t.due_date <= today).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const blocked = mine.filter((t) => t.status === "blocked" && !urgent.includes(t));
  const dups = mine.filter((t) => t.duplicate_of);
  const followNow = follows.filter((f) => f.next_date <= today);
  const followSoon = follows.filter((f) => f.next_date > today);
  const todo = conflicts.length + awaiting.length + urgent.length + blocked.length + dups.length + followNow.length;
  const upcoming = mine.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDays(today, 7)).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  const teamGoals = goals.filter((g) => g.scope === "team");
  const myGoals = goals.filter((g) => g.scope === "personal" && g.owner_id === me.id);

  const setup = [
    { ok: projects.length > 0, t: "建项目", href: "/settings#projects" },
    { ok: brief.trim().length > 0, t: "写团队档案", href: "/memory" },
    { ok: members.some((m) => m.id === me.id && m.last_ingest_at), t: "连接你的 AI", href: "/connect" },
    { ok: members.filter((m) => !m.invited).length > 1, t: "邀请队友", href: "/settings#members" },
  ];
  const projRows = projects.map((p) => {
    const ts = tasks.filter((t) => t.project_id === p.id);
    let d = 0, n = 0;
    for (const t of ts) { const pr = progressOf(t.status, t.subtasks); d += pr.done; n += pr.total; }
    return { ...p, pct: n ? Math.round((d / n) * 100) : 0, open: ts.filter((t) => t.status !== "done").length, late: ts.some((t) => t.status !== "done" && t.due_date && t.due_date < today) };
  });

  const line = (c: Change) => {
    const it = c.item_id ? <Link className="link" href={`/item/${c.item_id}`}>{c.title}</Link> : null;
    switch (c.type) {
      case "publish": return <>同步了「{c.conv_title}」</>;
      case "confirm": return <>{it} 达成共识</>;
      case "conflict": return <span style={{ color: "var(--red)" }}>{c.text}</span>;
      case "comment": case "object": return <>评论 {it}：<span className="muted">{c.text.slice(0, 50)}</span></>;
      case "task_progress": return <>{it}：<span className="muted">{c.text}</span></>;
      case "goal": return <>{c.text}</>;
      default: return <>新建 {it ?? c.text}</>;
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>{greet()}，{me.name}</h1>
          <p className="ph-meta">
            <span className={todo ? "hot" : ""}>{todo ? `${todo} 件待处理` : "没有待处理"}</span>
            {upcoming.length ? <span>{upcoming.length} 个任务 7 天内到期</span> : null}
            {followSoon.length ? <span>{followSoon.length} 个跟进</span> : null}
            {changes.length ? <span>{changes.length} 条新动态</span> : null}
          </p>
        </div>
      </div>

      {setup.some((s) => !s.ok) ? (
        <section className="setup">
          <b>开始使用</b>
          {setup.map((s, i) => (
            <Link key={s.t} href={s.href} className={`setup-step${s.ok ? " ok" : ""}`}>
              <span className="ck">{s.ok ? <Icon name="check" className="i sm" /> : i + 1}</span>{s.t}
            </Link>
          ))}
        </section>
      ) : null}

      <div className="ov">
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>待处理 <span className="c">{todo}</span></h2></div>
            {todo ? (
              <div>
                {conflicts.map((d) => {
                  const o = d.conflict_with ? byId.get(d.conflict_with) : null;
                  return (
                    <div className="at" key={`c${d.id}`}>
                      <span className="at-ic" style={{ background: "var(--red-bg)", color: "var(--red)" }}><Icon name="alert" /></span>
                      <div className="at-b">
                        <p><b>冲突</b> · <Link href={`/item/${d.id}`}>{d.title}</Link></p>
                        {o ? <p className="muted sm">与 <Link className="link" href={`/item/${o.id}`}>{code("decision", o.id)} {o.title}</Link></p> : null}
                        <div className="row">
                          <ActionButton className="btn sm pri" action={resolveConflict.bind(null, d.id, "this")}>用新的</ActionButton>
                          <ActionButton action={resolveConflict.bind(null, d.id, "other")}>保留原来的</ActionButton>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {urgent.map((t) => (
                  <div className="at" key={`u${t.id}`}>
                    <span className="at-ic" style={{ background: t.due_date! < today ? "var(--red-bg)" : "var(--amber-bg)", color: t.due_date! < today ? "var(--red)" : "var(--amber)" }}><Icon name="clock" /></span>
                    <div className="at-b">
                      <p><DueChip date={t.due_date} status={t.status} today={today} /> <Link href={`/item/${t.id}`}>{t.title}</Link></p>
                    </div>
                  </div>
                ))}
                {followNow.map((f) => (
                  <div className="at" key={`f${f.id}`}>
                    <span className="at-ic" style={{ background: f.next_date < today ? "var(--red-bg)" : "var(--amber-bg)", color: f.next_date < today ? "var(--red)" : "var(--amber)" }}><Icon name="target" /></span>
                    <div className="at-b">
                      <p><DueChip date={f.next_date} status="todo" today={today} /> 跟进 <Link href={`/outreach/${f.id}`}>{f.who}</Link></p>
                      {f.next_step ? <p className="muted sm">{f.next_step}</p> : null}
                      <div className="row"><LogTouchButton c={{ id: f.id, org: f.who, name: "", next_step: f.next_step, next_date: f.next_date }} /></div>
                    </div>
                  </div>
                ))}
                {awaiting.slice(0, 6).map((d) => (
                  <div className="at" key={`a${d.id}`}>
                    <span className="at-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Icon name="cons" /></span>
                    <div className="at-b">
                      <p><Link href={`/item/${d.id}`}>{d.title}</Link></p>
                      <p className="muted sm">{d.owner_name} 提出{d.body ? ` · ${d.body}` : ""}</p>
                      <div className="row">
                        <ActionButton className="btn sm pri" action={agree.bind(null, d.id)}><Icon name="check" />同意</ActionButton>
                        <Link className="btn sm" href={`/item/${d.id}#discuss`}>有意见</Link>
                      </div>
                    </div>
                  </div>
                ))}
                {blocked.map((t) => (
                  <div className="at" key={`b${t.id}`}>
                    <span className="at-ic" style={{ background: "var(--red-bg)", color: "var(--red)" }}><Icon name="clock" /></span>
                    <div className="at-b">
                      <p><b>阻塞</b> · <Link href={`/item/${t.id}`}>{t.title}</Link></p>
                      {t.blocked_by ? <p className="muted sm">等 <Link className="link" href={`/item/${t.blocked_by}`}>{code("decision", t.blocked_by)}</Link> 确认</p> : null}
                    </div>
                  </div>
                ))}
                {dups.map((t) => (
                  <div className="at" key={`d${t.id}`}>
                    <span className="at-ic" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}><Icon name="users" /></span>
                    <div className="at-b">
                      <p><b>可能重复</b> · <Link href={`/item/${t.id}`}>{t.title}</Link></p>
                      <p className="muted sm">和 <Link className="link" href={`/item/${t.duplicate_of}`}>{code("task", t.duplicate_of!)}</Link>{byId.get(t.duplicate_of!) ? `（${byId.get(t.duplicate_of!)!.assignee_name ?? byId.get(t.duplicate_of!)!.owner_name}）` : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="empty"><b>都处理完了</b></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>新动态 <span className="c">{ago(since) ? `自${ago(since)}` : ""}</span></h2><Link className="link" href="/activity">全部</Link></div>
            {changes.length ? (
              <ul className="since-list">
                {changes.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Avatar id={c.user_id} name={c.name} />
                    <span className="since-t"><b>{c.name}</b> {line(c)}</span>
                    <span className="muted since-ago">{ago(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : <div className="empty"><p>暂无新动态</p></div>}
          </section>
        </div>

        <div className="col">
          <section className="box">
            <div className="box-h"><h2>本周目标</h2><Link className="link" href="/week">本周</Link></div>
            {teamGoals.length || myGoals.length ? (
              <div className="mini-goals">
                {[...teamGoals, ...myGoals].slice(0, 6).map((g) => {
                  const pct = goalPct(g);
                  return (
                    <Link key={g.id} href="/week" className="mini-goal">
                      <span className="mg-t">{g.scope === "personal" ? <span className="pill">我</span> : null}{g.title}</span>
                      <span className="mg-b"><span className={`prog ${g.status === "done" ? "done" : g.status === "at_risk" ? "blocked" : ""}`}><span style={{ width: `${pct}%` }} /></span><span className="mono">{pct}%</span></span>
                    </Link>
                  );
                })}
              </div>
            ) : <div className="empty sm-empty"><Link className="btn sm" href="/week">定本周目标</Link></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>我的 DDL</h2><Link className="link" href="/tasks?v=timeline">时间线</Link></div>
            {upcoming.length || followSoon.length ? (
              <ul className="plist pad">
                {[...upcoming.map((t) => ({ k: `t${t.id}`, d: t.due_date!, node: <><DueChip date={t.due_date} status={t.status} today={today} /><Link href={`/item/${t.id}`}>{t.title}</Link></> })),
                  ...followSoon.map((f) => ({ k: `f${f.id}`, d: f.next_date, node: <><DueChip date={f.next_date} status="todo" today={today} /><Link href={`/outreach/${f.id}`}>跟进 {f.who}{f.next_step ? ` · ${f.next_step}` : ""}</Link><Heat h={f.heat} /></> }))]
                  .sort((a, b) => (a.d < b.d ? -1 : 1)).slice(0, 8).map((x) => <li key={x.k}>{x.node}</li>)}
              </ul>
            ) : <div className="empty sm-empty"><p>7 天内没有到期</p></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>项目</h2><Link className="link" href="/tasks">任务</Link></div>
            {projRows.length ? projRows.map((p) => (
              <div className="pr" key={p.id}>
                <Link className="nm" href={`/tasks?p=${p.id}`}><span className="pdot" style={{ background: p.color }} />{p.name}</Link>
                <div className="bars"><Progress done={p.pct} total={100} status={p.late ? "blocked" : p.pct === 100 ? "done" : "doing"} /><span className="pc">{p.pct}%</span></div>
                <span className="cnt">{p.open} 个未完成{p.late ? <span style={{ color: "var(--red)" }}> · 有逾期</span> : null}</span>
              </div>
            )) : <div className="empty sm-empty"><Link className="btn sm" href="/settings#projects">建项目</Link></div>}
          </section>

          {decisions.some((d) => d.status === "confirmed") ? (
            <section className="box">
              <div className="box-h"><h2>最近的共识</h2><Link className="link" href="/consensus?s=confirmed">全部</Link></div>
              <ul className="plist pad">
                {decisions.filter((d) => d.status === "confirmed").slice(0, 5).map((d) => (
                  <li key={d.id}><span className="ref">{code("decision", d.id)}</span><Link href={`/item/${d.id}`}>{d.title}</Link><Source s={d.source} only /></li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
