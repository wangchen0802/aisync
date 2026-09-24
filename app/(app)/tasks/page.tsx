import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listGoals, listItems, listMembers, listProjects } from "@/lib/core";
import { addDays, dayDiff, progressOf, todayISO, weekStart } from "@/lib/meta";
import { Kanban, type TaskCardData } from "@/components/kanban";
import { Timeline, type TimelineTask } from "@/components/timeline";
import { NewItemButton } from "@/components/client";
import { Avatar, DueChip, Icon } from "@/components/ui";

export const metadata = { title: "任务" };

const VIEWS = [["board", "看板", "task"], ["timeline", "时间线", "clock"], ["people", "按人", "users"]] as const;

export default async function Tasks({ searchParams }: { searchParams: Promise<{ p?: string; v?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const projectId = Number(sp.p) || null;
  const view = VIEWS.some(([k]) => k === sp.v) ? sp.v! : "board";
  const today = todayISO();
  const [items, projects, members, goals] = await Promise.all([
    listItems(me.id, { projectId, limit: 800 }), listProjects(), listMembers(), listGoals(me.id, weekStart(today)),
  ]);
  const tasks = items.filter((i) => i.kind === "task");
  const openDecisions = items.filter((i) => i.kind === "decision" && (i.status === "discussing" || i.status === "conflict")).map((d) => ({ id: d.id, title: d.title }));
  let done = 0, total = 0;
  for (const t of tasks) { const p = progressOf(t.status, t.subtasks); done += p.done; total += p.total; }
  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length;
  const thisWeek = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date >= today && t.due_date <= addDays(weekStart(today), 6)).length;
  const project = projects.find((p) => p.id === projectId);
  const activeMembers = members.filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));
  const qs = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const v = patch.v !== undefined ? patch.v : view;
    const p = patch.p !== undefined ? patch.p : projectId ? String(projectId) : null;
    if (v && v !== "board") u.set("v", v);
    if (p) u.set("p", p);
    const s = u.toString();
    return `/tasks${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>任务{project ? ` · ${project.name}` : ""}</h1>
          <p className="ph-meta">
            <span>完成 {total ? Math.round((done / total) * 100) : 0}%</span>
            {thisWeek ? <span>本周到期 {thisWeek}</span> : null}
            {overdue ? <span className="bad">逾期 {overdue}</span> : null}
          </p>
        </div>
        <NewItemButton kind="task" projects={projects} members={activeMembers} decisions={openDecisions} goals={goals.map((g) => ({ id: g.id, title: g.title }))} defaultProject={projectId} />
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="seg views" role="tablist" aria-label="视图">
          {VIEWS.map(([k, l, ic]) => <Link key={k} href={qs({ v: k })} role="tab" aria-selected={view === k} className="seg-link" aria-pressed={view === k}><Icon name={ic} className="i sm" />{l}</Link>)}
        </div>
        <div className="row src-pick" style={{ gap: 6 }}>
          <Link className={`chip${!projectId ? " chip-on" : ""}`} href={qs({ p: null })}>全部项目</Link>
          {projects.map((p) => (
            <Link key={p.id} className={`chip${projectId === p.id ? " chip-on" : ""}`} href={qs({ p: String(p.id) })}>
              <span className="pdot" style={{ background: p.color, marginRight: 6 }} />{p.name}
            </Link>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <Kanban
          tasks={tasks.map<TaskCardData>((t) => ({
            id: t.id, title: t.title, body: t.body, status: t.status, subtasks: t.subtasks, source: t.source, due: t.due, due_date: t.due_date,
            assignee_id: t.assignee_id, assignee_name: t.assignee_name, owner_id: t.owner_id, project_id: t.project_id, project_name: t.project_name, project_color: t.project_color,
            last_update: t.last_update, last_update_at: t.last_update_at, last_update_source: t.last_update_source, blocked_by: t.blocked_by, duplicate_of: t.duplicate_of, details: { reason: t.details.reason },
          }))}
          members={activeMembers} meId={me.id} isAdmin={me.role === "admin"}
        />
      ) : view === "timeline" ? (
        <Timeline
          tasks={tasks.map<TimelineTask>((t) => {
            const p = progressOf(t.status, t.subtasks);
            return {
              id: t.id, title: t.title, status: t.status, created_at: t.created_at, due_date: t.due_date, completed_at: t.completed_at,
              project_id: t.project_id, project_name: t.project_name, project_color: t.project_color,
              assignee_id: t.assignee_id, assignee_name: t.assignee_name, done: p.done, total: p.total,
            };
          })}
        />
      ) : (
        <div className="people">
          {activeMembers.map((m) => {
            const mine = tasks.filter((t) => t.assignee_id === m.id);
            const open = mine.filter((t) => t.status !== "done");
            const late = open.filter((t) => t.due_date && t.due_date < today);
            const week = open.filter((t) => t.due_date && t.due_date >= today && dayDiff(t.due_date, today) <= 6);
            const counts = { doing: mine.filter((t) => t.status === "doing").length, blocked: mine.filter((t) => t.status === "blocked").length, todo: mine.filter((t) => t.status === "todo").length, done: mine.filter((t) => t.status === "done").length };
            const n = Math.max(1, mine.length);
            const next = [...open].sort((a, b) => (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1).slice(0, 5);
            return (
              <section key={m.id} className="box person">
                <div className="person-h"><Avatar id={m.id} name={m.name} lg /><b>{m.name}</b>{m.id === me.id ? <span className="pill">我</span> : null}</div>
                <div className="person-stats">
                  <span><b>{open.length}</b>未完成</span>
                  <span><b>{week.length}</b>7 天内</span>
                  <span className={late.length ? "bad" : ""}><b>{late.length}</b>逾期</span>
                  <span><b>{counts.done}</b>已完成</span>
                </div>
                <div className="stackbar" role="img" aria-label={`进行中 ${counts.doing}，阻塞 ${counts.blocked}，待开始 ${counts.todo}，已完成 ${counts.done}`}>
                  {counts.doing ? <span style={{ width: `${(counts.doing / n) * 100}%`, background: "var(--accent)" }} title={`进行中 ${counts.doing}`} /> : null}
                  {counts.blocked ? <span style={{ width: `${(counts.blocked / n) * 100}%`, background: "var(--red)" }} title={`阻塞 ${counts.blocked}`} /> : null}
                  {counts.todo ? <span style={{ width: `${(counts.todo / n) * 100}%`, background: "var(--line-2)" }} title={`待开始 ${counts.todo}`} /> : null}
                  {counts.done ? <span style={{ width: `${(counts.done / n) * 100}%`, background: "var(--green)" }} title={`已完成 ${counts.done}`} /> : null}
                </div>
                {next.length ? (
                  <ul className="plist">
                    {next.map((t) => <li key={t.id}><span className={`dot-s s-${t.status}`} /><Link href={`/item/${t.id}`}>{t.title}</Link><DueChip date={t.due_date} status={t.status} today={today} /></li>)}
                  </ul>
                ) : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>没有未完成的任务</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
