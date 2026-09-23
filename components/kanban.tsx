"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { deleteItem, editItem, moveTask, setSubtasks } from "@/lib/actions";
import { ago, code, TASK_COLUMNS, TASK_STATUS, avatarColor, sourceOf, type Subtask } from "@/lib/meta";
import { report, toast } from "@/components/client";
import { DueChip, Icon } from "@/components/ui";

export type TaskCardData = {
  id: number; title: string; body: string; status: string; subtasks: Subtask[]; source: string; due: string | null; due_date: string | null;
  assignee_id: number | null; assignee_name: string | null; owner_id: number | null; project_id: number | null; project_name: string | null; project_color: string | null;
  last_update: string | null; last_update_at: string | null; last_update_source?: string | null; blocked_by: number | null; duplicate_of: number | null; details: { reason?: string };
};

function Av({ id, name }: { id: number | null; name: string | null }) {
  return <span className="av" style={{ background: avatarColor(id) }} title={name ?? ""}>{(name ?? "?").slice(0, 1).toUpperCase()}</span>;
}
function Src({ s }: { s: string }) {
  const p = sourceOf(s);
  return <span className="pv only" title={p.name}><i style={{ background: p.color }}>{p.abbr}</i></span>;
}

const NEXT: Record<string, [string, string] | undefined> = { todo: ["doing", "开始"], doing: ["done", "完成"], blocked: ["doing", "解除阻塞"] };

function Card({ t, members, meId, canDelete, onMove }: { t: TaskCardData; members: { id: number; name: string }[]; meId: number; canDelete: boolean; onMove: (status: string, id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState(t.subtasks);
  const [newSub, setNewSub] = useState("");
  const [, start] = useTransition();
  useEffect(() => setSubs(t.subtasks), [t.subtasks]);
  const done = subs.length ? subs.filter((s) => s.done).length : t.status === "done" ? 1 : 0;
  const total = subs.length || 1;
  const save = (next: Subtask[]) => { setSubs(next); start(async () => { const r = await setSubtasks(t.id, next); if (!r.ok) report(r); }); };
  const ref = code("task", t.id);

  return (
    <article className="tk" id={ref} draggable data-task={t.id} data-x
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(t.id)); e.dataTransfer.effectAllowed = "move"; (e.currentTarget as HTMLElement).classList.add("drag"); }}
      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove("drag")}>
      <div className="meta">
        <span className="ref">{ref}</span>
        {t.project_name ? <span className="proj"><span className="pdot" style={{ background: t.project_color ?? "var(--faint)" }} />{t.project_name}</span> : null}
        <span className="grow" />
        <Av id={t.assignee_id} name={t.assignee_name} />
      </div>
      <h4><a className="title-link" href={`/item/${t.id}`} draggable={false}>{t.title}</a></h4>
      {subs.length || t.status === "done" ? <div className="pg">
        <div className={`prog ${t.status === "done" ? "done" : t.status === "blocked" ? "blocked" : ""}`}><span style={{ width: `${(done / total) * 100}%` }} /></div>
        {done}/{total}
      </div> : null}
      {t.status === "blocked" ? <div className="flag red">{t.blocked_by ? `等待 ${code("decision", t.blocked_by)} 达成共识` : t.last_update || "阻塞中"}</div> : null}
      {t.duplicate_of && t.status !== "done" ? <div className="flag amber">可能与 {code("task", t.duplicate_of)} 重复{t.details.reason ? `：${t.details.reason}` : ""}</div> : null}
      {t.last_update ? <div className="upd d-std"><Src s={t.last_update_source ?? t.source} /><span>{t.last_update} · {ago(t.last_update_at)}</span></div> : null}
      <div className={open ? "" : "d-full"}>
        {subs.length ? (
          <ul className="subs">
            {subs.map((s, i) => (
              <li key={i} className={s.done ? "ok" : ""}>
                <label><input type="checkbox" checked={s.done} onChange={() => save(subs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} /><span>{s.title}</span></label>
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (newSub.trim()) { save([...subs, { title: newSub.trim(), done: false }]); setNewSub(""); } }}>
              <input className="input sm grow" placeholder="添加子任务，回车确认" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
            </form>
            <div className="row">
              <select className="select sm" value={t.assignee_id ?? ""} onChange={(e) => start(async () => report(await editItem(t.id, { assigneeId: Number(e.target.value) || null })))} aria-label="负责人">
                {members.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? `${m.name}（我）` : m.name}</option>)}
              </select>
              <input className="input sm" type="date" style={{ width: 140 }} defaultValue={t.due_date ?? ""} aria-label="DDL"
                onChange={(e) => start(async () => report(await editItem(t.id, { dueDate: e.target.value || null })))} />
              {canDelete ? <button className="btn sm ghost danger" onClick={() => start(async () => report(await deleteItem(t.id)))}><Icon name="trash" /></button> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="meta">
        {t.due_date ? <DueChip date={t.due_date} status={t.status} /> : <span className="faint">无 DDL</span>}<span className="grow" />
        {NEXT[t.status] ? <button className="btn sm advance" onClick={() => onMove(NEXT[t.status]![0], t.id)}>{NEXT[t.status]![1]} <Icon name="arrow" className="i sm" /></button> : null}
        <button className="more" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="chev" />{open ? "收起" : "编辑"}</button>
      </div>
    </article>
  );
}

export function Kanban({ tasks, members, meId, isAdmin }: { tasks: TaskCardData[]; members: { id: number; name: string }[]; meId: number; isAdmin: boolean }) {
  const [local, setLocal] = useState(tasks);
  const [mine, setMine] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setLocal(tasks), [tasks]);
  const shown = useMemo(() => (mine ? local.filter((t) => t.assignee_id === meId) : local), [local, mine, meId]);

  const drop = (status: string, id: number) => {
    const t = local.find((x) => x.id === id);
    setOver(null);
    if (!t || t.status === status) return;
    setLocal((xs) => xs.map((x) => (x.id === id ? { ...x, status, subtasks: status === "done" ? x.subtasks.map((s) => ({ ...s, done: true })) : x.subtasks } : x)));
    start(async () => {
      const r = await moveTask(id, status);
      if (r.ok) toast(`${code("task", id)} → ${TASK_STATUS[status]}`);
      else { report(r); setLocal(tasks); }
    });
  };

  return (
    <>
      <div className="row">
        <div className="seg" role="group" aria-label="筛选">
          <button aria-pressed={!mine} onClick={() => setMine(false)}>全部</button>
          <button aria-pressed={mine} onClick={() => setMine(true)}>只看我的</button>
        </div>
        <span className="muted desk-only" style={{ fontSize: 12 }}>拖动卡片改变状态 · 勾选子任务自动推进进度</span><span className="muted mobile-only" style={{ fontSize: 12 }}>点「开始 / 完成」推进状态</span>
      </div>
      <div className="kb-wrap">
        <div className="kb">
          {TASK_COLUMNS.map((s) => {
            const col = shown.filter((t) => t.status === s);
            return (
              <div key={s} className={`kc${over === s ? " over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); drop(s, Number(e.dataTransfer.getData("text/plain"))); }}>
                <div className="kc-h"><span className={`tag s-${s}`}>{TASK_STATUS[s]}</span><span className="n">{col.length}</span></div>
                {col.map((t) => <Card key={t.id} t={t} members={members} meId={meId} canDelete={isAdmin || t.owner_id === meId} onMove={drop} />)}
                {!col.length ? <div className="muted" style={{ fontSize: 12, padding: "10px 6px", textAlign: "center" }}>拖到这里</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
