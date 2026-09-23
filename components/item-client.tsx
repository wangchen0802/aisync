"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addComment, editItem, moveTask, setSubtasks } from "@/lib/actions";
import { TASK_COLUMNS, TASK_STATUS, type Subtask } from "@/lib/meta";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

export function CommentForm({ itemId, placeholder = "写下你的看法，⌘/Ctrl + Enter 发送" }: { itemId: number; placeholder?: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (location.hash === "#discuss") ref.current?.focus({ preventScroll: true });
  }, []);
  const send = () => {
    if (!text.trim()) return;
    start(async () => {
      const r = await addComment(itemId, text);
      report(r);
      if (r.ok) setText("");
    });
  };
  return (
    <div className="composer">
      <textarea
        ref={ref} className="textarea" rows={2} value={text} placeholder={placeholder} aria-label="评论"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
      />
      <button className="btn pri" disabled={pending || !text.trim()} onClick={send}>{pending ? <span className="spin" /> : <Icon name="send" />}发送</button>
    </div>
  );
}

export function TaskControls({
  id, status, subtasks, assigneeId, due, members, goals = [], goalId = null,
}: { id: number; status: string; subtasks: Subtask[]; assigneeId: number | null; due: string | null; members: { id: number; name: string }[]; goals?: { id: number; title: string }[]; goalId?: number | null }) {
  const [st, setSt] = useState(status);
  const [subs, setSubs] = useState(subtasks);
  const [newSub, setNewSub] = useState("");
  const [, start] = useTransition();
  useEffect(() => { setSt(status); setSubs(subtasks); }, [status, subtasks]);
  const saveSubs = (next: Subtask[]) => { setSubs(next); start(async () => { const r = await setSubtasks(id, next); if (!r.ok) report(r); }); };
  const done = subs.filter((s) => s.done).length;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="seg status-seg" role="group" aria-label="任务状态">
        {TASK_COLUMNS.map((s) => (
          <button key={s} aria-pressed={st === s} onClick={() => { if (s === st) return; setSt(s); start(async () => report(await moveTask(id, s))); }}>
            <span className={`dot-s s-${s}`} />{TASK_STATUS[s]}
          </button>
        ))}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>子任务 {subs.length ? `${done}/${subs.length}` : ""}</span>
        </div>
        {subs.length ? (
          <ul className="subs big">
            {subs.map((s, i) => (
              <li key={i} className={s.done ? "ok" : ""}>
                <label><input type="checkbox" checked={s.done} onChange={() => saveSubs(subs.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} /><span>{s.title}</span></label>
                <button className="btn ghost icon sm-x" aria-label="删除子任务" onClick={() => saveSubs(subs.filter((_, j) => j !== i))}><Icon name="x" className="i sm" /></button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (newSub.trim()) { saveSubs([...subs, { title: newSub.trim(), done: false }]); setNewSub(""); } }}>
          <input className="input grow" placeholder="添加子任务，回车确认" value={newSub} onChange={(e) => setNewSub(e.target.value)} aria-label="新子任务" />
        </form>
      </div>
      <div className="two">
        <label className="field"><span>负责人</span>
          <select className="select" defaultValue={assigneeId ?? ""} onChange={(e) => start(async () => report(await editItem(id, { assigneeId: Number(e.target.value) || null })))}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field"><span>DDL</span>
          <input className="input" type="date" defaultValue={due ?? ""} onChange={(e) => start(async () => report(await editItem(id, { dueDate: e.target.value || null })))} />
        </label>
      </div>
      {goals.length ? (
        <label className="field"><span>关联本周目标</span>
          <select className="select" defaultValue={goalId ?? ""} onChange={(e) => start(async () => report(await editItem(id, { goalId: Number(e.target.value) || null })))}>
            <option value="">不关联</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function EditableText({ id, title, body }: { id: number; title: string; body: string }) {
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <button className="btn ghost sm" onClick={() => setEditing(true)}><Icon name="edit" />编辑</button>
    );
  return (
    <div className="stack" style={{ gap: 8, flex: "1 1 100%" }}>
      <input className="input" value={t} onChange={(e) => setT(e.target.value)} aria-label="标题" />
      <textarea className="textarea" rows={2} value={b} onChange={(e) => setB(e.target.value)} aria-label="理由" placeholder="理由 / 补充" />
      <div className="row">
        <button className="btn sm pri" disabled={pending || !t.trim()} onClick={() => start(async () => { const r = await editItem(id, { title: t, body: b }); report(r); if (r.ok) setEditing(false); })}>保存</button>
        <button className="btn sm ghost" onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>
  );
}
