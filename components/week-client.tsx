"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteGoal, saveGoal, setGoalStatus } from "@/lib/actions";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

export type GoalView = {
  id: number; title: string; scope: "team" | "personal"; owner_name: string | null; mine: boolean; status: string; pct: number;
  tasks_total: number; tasks_done: number; project_name: string | null; project_color: string | null; manual_progress: number | null;
};

const STATUS: Record<string, [string, string]> = {
  on_track: ["正常推进", "s-doing"], at_risk: ["有风险", "s-blocked"], done: ["已达成", "s-done"], missed: ["未达成", "s-todo"],
};

export function GoalAdd({ scope, week, projects }: { scope: "team" | "personal"; week: string; projects: { id: number; name: string }[] }) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="goal-add" onSubmit={(e) => {
      e.preventDefault();
      if (!title.trim()) return;
      start(async () => { const r = await saveGoal({ title, scope, week, projectId: Number(project) || null }); report(r); if (r.ok) setTitle(""); });
    }}>
      <Icon name="plus" className="i sm" />
      <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={scope === "team" ? "添加团队目标" : "添加我的目标"} aria-label="新目标" />
      {projects.length ? (
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="项目">
          <option value="">不限项目</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : null}
      <button className="btn sm pri" disabled={pending || !title.trim()}>添加</button>
    </form>
  );
}

export function GoalRow({ g }: { g: GoalView }) {
  const [pending, start] = useTransition();
  const [manual, setManual] = useState(g.manual_progress ?? 0);
  const [st, label] = [g.status, STATUS[g.status] ?? STATUS.on_track];
  return (
    <div className={`goal${g.status === "done" ? " is-done" : ""}`}>
      <div className="goal-top">
        <div className="goal-t">
          <b>{g.title}</b>
          <span className="meta">
            {g.scope === "personal" ? <span>{g.owner_name}</span> : null}
            {g.project_name ? <span className="proj"><span className="pdot" style={{ background: g.project_color ?? "var(--faint)" }} />{g.project_name}</span> : null}
            {g.tasks_total ? <Link className="link" href={`/tasks?v=board`}>任务 {g.tasks_done}/{g.tasks_total}</Link> : <span>未关联任务</span>}
          </span>
        </div>
        <select className={`tag goal-status ${label[1]}`} value={st} disabled={pending} aria-label="目标状态"
          onChange={(e) => start(async () => report(await setGoalStatus(g.id, e.target.value as "on_track")))}>
          {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="goal-bar">
        <div className={`prog ${g.status === "done" ? "done" : g.status === "at_risk" ? "blocked" : ""}`}><span style={{ width: `${g.pct}%` }} /></div>
        <span className="mono">{g.pct}%</span>
        {!g.tasks_total && g.mine ? (
          <input type="range" min={0} max={100} step={10} value={manual} aria-label="手动进度"
            onChange={(e) => setManual(Number(e.target.value))}
            onMouseUp={() => start(async () => report(await saveGoal({ id: g.id, title: g.title, scope: g.scope, manualProgress: manual })))}
            onTouchEnd={() => start(async () => report(await saveGoal({ id: g.id, title: g.title, scope: g.scope, manualProgress: manual })))} />
        ) : null}
        {g.mine ? <button className="btn ghost icon" aria-label="删除目标" onClick={() => start(async () => report(await deleteGoal(g.id)))}><Icon name="trash" className="i sm" /></button> : null}
      </div>
    </div>
  );
}

export function DoneChart({ days }: { days: { day: string; label: string; count: number; titles: string[]; future: boolean }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const H = 96;
  return (
    <div className="dchart" onMouseLeave={() => setHover(null)}>
      <div className="dchart-plot" style={{ height: H }}>
        {[0.5, 1].map((f) => <span key={f} className="dchart-grid" style={{ bottom: f * H }} />)}
        {days.map((d, i) => (
          <button key={d.day} type="button" className="dchart-col" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} aria-label={`${d.label} 完成 ${d.count} 个`}>
            {d.count ? <span className="dchart-bar" style={{ height: Math.max(4, (d.count / max) * (H - 8)) }} /> : <span className={`dchart-zero${d.future ? " future" : ""}`} />}
            {d.count && (i === hover || d.count === max) ? <span className="dchart-val">{d.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="dchart-x">{days.map((d) => <span key={d.day}>{d.label}</span>)}</div>
      {hover != null && days[hover].count ? (
        <div className="dchart-tip">
          <b>{days[hover].label} 完成 {days[hover].count} 个</b>
          {days[hover].titles.slice(0, 4).map((t, i) => <span key={i}>{t}</span>)}
          {days[hover].titles.length > 4 ? <span>…还有 {days[hover].titles.length - 4} 个</span> : null}
        </div>
      ) : null}
    </div>
  );
}
