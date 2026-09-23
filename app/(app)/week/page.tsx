import Link from "next/link";
import { requireUser } from "@/lib/session";
import { goalPct, listGoals, listItems, listProjects } from "@/lib/core";
import { q } from "@/lib/db";
import { carryOverGoals, pushWeeklyReview } from "@/lib/actions";
import { addDays, code, fmtDay, todayISO, weekStart } from "@/lib/meta";
import { ActionButton } from "@/components/client";
import { DoneChart, GoalAdd, GoalRow, type GoalView } from "@/components/week-client";
import { Avatar, DueChip, Icon } from "@/components/ui";

export const metadata = { title: "本周" };
const WD = ["一", "二", "三", "四", "五", "六", "日"];

export default async function Week({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const me = await requireUser();
  const today = todayISO();
  const want = (await searchParams).w;
  const mon = weekStart(want && /^\d{4}-\d{2}-\d{2}$/.test(want) ? want : today);
  const sun = addDays(mon, 6);
  const isCurrent = mon === weekStart(today);
  const [goals, items, projects, prevGoals] = await Promise.all([listGoals(me.id, mon), listItems(me.id, { limit: 800 }), listProjects(), listGoals(me.id, addDays(mon, -7))]);
  const weekNo = Math.ceil((((new Date(`${mon}T00:00:00Z`).getTime() - Date.UTC(Number(mon.slice(0, 4)), 0, 1)) / 864e5) + 1) / 7);

  const view = (g: (typeof goals)[number]): GoalView => ({
    id: g.id, title: g.title, scope: g.scope, owner_name: g.owner_name, mine: g.scope === "team" || g.owner_id === me.id, status: g.status, pct: goalPct(g),
    tasks_total: g.tasks_total, tasks_done: g.tasks_done, project_name: g.project_name, project_color: g.project_color, manual_progress: g.manual_progress,
  });
  const team = goals.filter((g) => g.scope === "team").map(view);
  const personal = goals.filter((g) => g.scope === "personal" && g.owner_id === me.id).map(view);
  const carry = prevGoals.filter((g) => g.status !== "done" && !goals.some((x) => x.title === g.title)).length;

  const tasks = items.filter((i) => i.kind === "task");
  const dueThisWeek = tasks.filter((t) => t.due_date && t.due_date >= mon && t.due_date <= sun);
  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < mon && isCurrent);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const doneRows = await q<{ day: string; title: string }>(
    "select to_char(completed_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD') as day, title from items where kind = 'task' and visibility = 'team' and completed_at >= ($1::date - interval '8 hours') and completed_at < ($2::date + interval '16 hours')",
    [mon, sun],
  );
  const doneByDay = days.map((d, i) => {
    const titles = doneRows.filter((r) => r.day === d).map((r) => r.title);
    return { day: d, label: `周${WD[i]}`, count: titles.length, titles, future: d > today };
  });
  const confirmed = items.filter((i) => i.kind === "decision" && i.status === "confirmed" && i.updated_at.slice(0, 10) >= mon && i.updated_at.slice(0, 10) <= sun);
  const doneCount = doneRows.length;
  const teamPct = team.length ? Math.round(team.reduce((s, g) => s + g.pct, 0) / team.length) : 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>第 {weekNo} 周 <span className="muted" style={{ fontWeight: 400, fontSize: 16 }}>{fmtDay(mon).split(" ")[0]} – {fmtDay(sun).split(" ")[0]}</span></h1>
          <p>{team.length ? `团队目标平均完成 ${teamPct}%` : "还没有设定本周目标"} · 本周完成 {doneCount} 个任务 · 形成 {confirmed.length} 项共识{overdue.length ? ` · ${overdue.length} 个任务逾期` : ""}</p>
        </div>
        <div className="row">
          <Link className="btn" href={`/week?w=${addDays(mon, -7)}`} aria-label="上一周"><Icon name="back" /></Link>
          {!isCurrent ? <Link className="btn" href="/week">回到本周</Link> : null}
          <Link className="btn" href={`/week?w=${addDays(mon, 7)}`} aria-label="下一周"><Icon name="chev" /></Link>
        </div>
      </div>

      <div className="ov">
        <div className="col">
          <section className="box">
            <div className="box-h">
              <h2><Icon name="bolt" />团队目标 <span className="c">{team.length}</span></h2>
              {carry && isCurrent ? <ActionButton className="btn sm ghost" action={carryOverGoals.bind(null, addDays(mon, -7), mon)}>延续上周未完成（{carry}）</ActionButton> : null}
            </div>
            <div className="goals">
              {team.map((g) => <GoalRow key={g.id} g={g} />)}
              <GoalAdd scope="team" week={mon} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
          </section>

          <section className="box">
            <div className="box-h"><h2><Icon name="clock" />本周 DDL</h2><span className="c">{dueThisWeek.length} 个到期</span></div>
            <div className="wk">
              {days.map((d, i) => {
                const list = dueThisWeek.filter((t) => t.due_date === d);
                return (
                  <div key={d} className={`wk-day${d === today ? " is-today" : ""}${d < today ? " is-past" : ""}`}>
                    <div className="wk-h"><b>周{WD[i]}</b><span>{Number(d.slice(8))}</span></div>
                    {list.map((t) => (
                      <Link key={t.id} href={`/item/${t.id}`} className={`wk-task${t.status === "done" ? " done" : ""}${t.status !== "done" && d < today ? " late" : ""}`} style={{ ["--c" as string]: t.project_color ?? "var(--line-2)" }} title={t.title}>
                        <span className="wk-t">{t.status === "done" ? "✓ " : ""}{t.title}</span>
                        <span className="wk-who">{t.assignee_name ?? ""}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
            {overdue.length ? (
              <div className="pad" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>之前逾期、还没完成</div>
                <ul className="plist">{overdue.slice(0, 6).map((t) => <li key={t.id}><Avatar id={t.assignee_id} name={t.assignee_name} /><Link href={`/item/${t.id}`}>{t.title}</Link><DueChip date={t.due_date} status={t.status} today={today} /></li>)}</ul>
              </div>
            ) : null}
          </section>
        </div>

        <div className="col">
          <section className="box">
            <div className="box-h"><h2>我的本周目标</h2><span className="c">仅自己可见</span></div>
            <div className="goals">
              {personal.map((g) => <GoalRow key={g.id} g={g} />)}
              <GoalAdd scope="personal" week={mon} projects={[]} />
            </div>
          </section>

          <section className="box">
            <div className="box-h"><h2>每天完成的任务</h2><span className="c">{doneCount} 个</span></div>
            <div className="pad"><DoneChart days={doneByDay} /></div>
          </section>

          <section className="box">
            <div className="box-h">
              <h2>本周回顾</h2>
              <ActionButton className="btn sm" action={pushWeeklyReview.bind(null, mon)}><Icon name="arrow" />发到群</ActionButton>
            </div>
            <div className="pad stack" style={{ gap: 10, fontSize: 13 }}>
              <div><div className="muted" style={{ fontSize: 12 }}>目标</div>{team.length ? team.map((g) => <div key={g.id} className="row" style={{ gap: 6 }}><span className={`dot-s s-${g.status === "done" ? "done" : g.status === "at_risk" ? "blocked" : "doing"}`} />{g.title}<span className="faint mono">{g.pct}%</span></div>) : <span className="faint">无</span>}</div>
              <div><div className="muted" style={{ fontSize: 12 }}>达成的共识</div>{confirmed.length ? confirmed.slice(0, 6).map((d) => <div key={d.id}><Link className="link" href={`/item/${d.id}`}>{code("decision", d.id)}</Link> {d.title}</div>) : <span className="faint">无</span>}</div>
              <div><div className="muted" style={{ fontSize: 12 }}>完成的任务</div>{doneRows.length ? doneRows.slice(0, 8).map((r, i) => <div key={i}>✓ {r.title}</div>) : <span className="faint">无</span>}</div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
