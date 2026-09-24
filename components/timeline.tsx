"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, avatarColor, dayDiff, fmtDay, fmtDue, TASK_STATUS, todayISO, weekday } from "@/lib/meta";

export type TimelineTask = {
  id: number; title: string; status: string; created_at: string; due_date: string | null; completed_at: string | null;
  project_id: number | null; project_name: string | null; project_color: string | null;
  assignee_id: number | null; assignee_name: string | null; done: number; total: number;
};

const DW = 30; // px per day
const BEFORE = 7;
const AFTER = 35;

export function Timeline({ tasks }: { tasks: TimelineTask[] }) {
  const today = todayISO();
  const start = addDays(today, -BEFORE);
  const days = useMemo(() => Array.from({ length: BEFORE + AFTER + 1 }, (_, i) => addDays(start, i)), [start]);
  const [hover, setHover] = useState<{ t: TimelineTask; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Open on "today" with a few days of history visible.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, (BEFORE - 3) * DW);
  }, []);

  const scheduled = tasks.filter((t) => t.due_date);
  const unscheduled = tasks.filter((t) => !t.due_date && t.status !== "done");
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; color: string; rows: TimelineTask[] }>();
    for (const t of [...scheduled].sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))) {
      const key = String(t.project_id ?? 0);
      if (!m.has(key)) m.set(key, { name: t.project_name ?? "未归入项目", color: t.project_color ?? "var(--faint)", rows: [] });
      m.get(key)!.rows.push(t);
    }
    return [...m.values()];
  }, [scheduled]);

  const idx = (iso: string) => Math.max(0, Math.min(days.length - 1, dayDiff(iso, start)));
  const todayX = dayDiff(today, start) * DW;

  const bar = (t: TimelineTask) => {
    const created = t.created_at.slice(0, 10);
    const endIso = t.status === "done" && t.completed_at ? t.completed_at.slice(0, 10) : t.due_date!;
    const s = idx(created < endIso ? created : endIso);
    const e = idx(endIso);
    const overdue = t.status !== "done" && t.due_date! < today;
    const offLeft = dayDiff(endIso, start) < 0;
    const offRight = dayDiff(created, days[days.length - 1]) > 0;
    if (offLeft || offRight) return null;
    const pct = t.total ? t.done / t.total : 0;
    return (
      <>
        <div
          className={`tl-bar${t.status === "done" ? " done" : ""}${t.status === "blocked" ? " blocked" : ""}`}
          style={{ left: s * DW + 2, width: Math.max(DW - 4, (e - s + 1) * DW - 4), ["--c" as string]: t.project_color ?? "var(--faint)" }}
        >
          <span className="tl-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
          <span className="tl-cap" />
        </div>
        {overdue ? <div className="tl-late" style={{ left: (idx(t.due_date!) + 1) * DW, width: Math.max(0, (dayDiff(today, t.due_date!) ) * DW) }} /> : null}
      </>
    );
  };

  const move = (t: TimelineTask) => (e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ t, x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 });
  };

  if (!tasks.length) return <div className="box"><div className="empty"><p>暂无设了 DDL 的任务</p></div></div>;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="box tl" ref={wrap} onMouseLeave={() => setHover(null)}>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-grid" style={{ ["--days" as string]: days.length, ["--dw" as string]: `${DW}px` }}>
            <div className="tl-head tl-label">任务</div>
            <div className="tl-head tl-days">
              {days.map((d) => (
                <span key={d} className={`tl-day${d === today ? " is-today" : ""}${weekday(d) === 1 ? " is-mon" : ""}${weekday(d) === 0 || weekday(d) === 6 ? " is-wkd" : ""}`}>
                  {weekday(d) === 1 || d === today ? <b>{d === today ? "今天" : fmtDay(d).split(" ")[0]}</b> : null}
                  <i>{Number(d.slice(8))}</i>
                </span>
              ))}
            </div>
            {groups.map((g) => (
              <div className="tl-group" key={g.name}>
                <div className="tl-gname tl-label"><span className="pdot" style={{ background: g.color }} />{g.name}<span className="faint">{g.rows.length}</span></div>
                <div className="tl-gline" />
                {g.rows.map((t) => (
                  <div className="tl-row" key={t.id}>
                    <Link href={`/item/${t.id}`} className="tl-label tl-name" title={t.title}>
                      <span className="av" style={{ background: avatarColor(t.assignee_id), width: 18, height: 18, fontSize: 9.5 }}>{(t.assignee_name ?? "?").slice(0, 1)}</span>
                      <span className="tl-t">{t.title}</span>
                    </Link>
                    <Link href={`/item/${t.id}`} className="tl-track" onMouseMove={move(t)} onMouseLeave={() => setHover(null)} aria-label={`${t.title}，DDL ${t.due_date}，${TASK_STATUS[t.status]}`}>
                      {bar(t)}
                    </Link>
                  </div>
                ))}
              </div>
            ))}
            <div className="tl-today" style={{ left: `calc(var(--label) + ${todayX + DW / 2}px)` }} />
          </div>
        </div>
        {hover ? (
          <div className="tl-tip" style={{ left: hover.x, top: hover.y }}>
            <b>{hover.t.title}</b>
            <span>{hover.t.assignee_name ?? "未分配"} · {TASK_STATUS[hover.t.status]}{hover.t.total > 1 ? ` · ${hover.t.done}/${hover.t.total}` : ""}</span>
            <span>DDL {hover.t.due_date}（{hover.t.status === "done" ? "已完成" : fmtDue(hover.t.due_date, today)}）</span>
          </div>
        ) : null}
        <div className="tl-legend">
          <span><i className="lg-bar" />创建 → DDL</span>
          <span><i className="lg-fill" />已完成部分</span>
          <span><i className="lg-late" />逾期</span>
          <span><i className="lg-done" />已完成</span>
          <span><i className="lg-today" />今天</span>
        </div>
      </div>
      {unscheduled.length ? (
        <div className="box">
          <div className="box-h"><h2>未设 DDL <span className="c">{unscheduled.length}</span></h2></div>
          <div className="chips pad">
            {unscheduled.map((t) => <Link key={t.id} href={`/item/${t.id}`} className="chip">{t.title.slice(0, 28)}{t.title.length > 28 ? "…" : ""}</Link>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
