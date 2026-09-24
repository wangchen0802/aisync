"use client";

import { useState, useTransition } from "react";
import { convertIdea, createItem, deleteItem, shareIdea } from "@/lib/actions";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

export function IdeaInput({ projects }: { projects: { id: number; name: string }[] }) {
  const [text, setText] = useState("");
  const [project, setProject] = useState("");
  const [pending, start] = useTransition();
  const submit = () => {
    const [first, ...rest] = text.trim().split("\n");
    if (!first) return;
    start(async () => {
      const r = await createItem({ kind: "idea", title: first.slice(0, 200), body: rest.join("\n").trim(), projectId: Number(project) || null });
      report(r);
      if (r.ok) setText("");
    });
  };
  return (
    <div className="box idea-input">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="新想法"
        placeholder={"写下想法。第一行是标题，⌘↵ 保存"}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }} />
      <div className="row">
        <span className="muted" style={{ fontSize: 12 }}><Icon name="lock" className="i sm" /> 仅自己可见</span>
        <span className="grow" />
        {projects.length ? (
          <select className="select sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="项目">
            <option value="">不归入项目</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        <button className="btn pri" disabled={pending || !text.trim()} onClick={submit}>保存</button>
      </div>
    </div>
  );
}

export function IdeaActions({ id, shared }: { id: number; shared: boolean }) {
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<Parameters<typeof report>[0]>) => start(async () => report(await fn()));
  return (
    <div className="row" style={{ gap: 6 }}>
      {!shared ? <button className="btn sm" disabled={pending} onClick={() => go(() => shareIdea(id))}><Icon name="users" />分享</button> : null}
      <button className="btn sm ghost" disabled={pending} onClick={() => go(() => convertIdea(id, "decision"))}>转为决策</button>
      <button className="btn sm ghost" disabled={pending} onClick={() => go(() => convertIdea(id, "task"))}>转为任务</button>
      <button className="btn sm ghost" disabled={pending} onClick={() => go(() => convertIdea(id, "question"))}>转为问题</button>
      <button className="btn sm ghost danger" aria-label="删除" disabled={pending} onClick={() => go(() => deleteItem(id))}><Icon name="trash" className="i sm" /></button>
    </div>
  );
}
