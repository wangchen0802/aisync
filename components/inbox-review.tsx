"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discardConversation, keepPrivate, publishConversation } from "@/lib/actions";
import { ago, KIND_LABEL, TASK_STATUS, sourceOf } from "@/lib/meta";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

type Draft = { id: number; kind: string; title: string; body: string; sensitive: boolean; assignee: string; due: string | null; subtasks: string[]; note: string; doneSubtasks: string[]; newStatus: string };
type Conv = { id: number; title: string; summary: string; source: string; created_at: string; project_id: number | null; engine: string; sensitive: boolean; url: string | null };

export function InboxReview({ conv, drafts, projects }: { conv: Conv; drafts: Draft[]; projects: { id: number; name: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(drafts.map((d) => ({ ...d, include: !d.sensitive })));
  const [project, setProject] = useState(conv.project_id ? String(conv.project_id) : "");
  const [pending, start] = useTransition();
  const src = sourceOf(conv.source);
  const upd = (id: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const n = rows.filter((r) => r.include).length;
  const after = () => router.push("/inbox");

  return (
    <section className="box rv">
      <div className="meta">
        <span className="pv"><i style={{ background: src.color }}>{src.abbr}</i>{src.name}</span>
        <span>{ago(conv.created_at)}</span>
        {conv.engine === "rules" ? <span className="pill">规则提取</span> : <span className="pill ok">AI 提炼</span>}
        {conv.sensitive ? <span className="pill" title="检测到密钥或手机号，已自动打码"><Icon name="lock" className="i sm" /> 已打码敏感信息</span> : null}
        {conv.url ? <a className="link" href={conv.url} target="_blank" rel="noreferrer">打开原对话</a> : null}
      </div>
      <h2>{conv.title}</h2>
      {conv.summary ? <p className="muted" style={{ margin: 0, maxWidth: "72ch" }}>{conv.summary}</p> : null}

      <div className="stack" style={{ gap: 6 }}>
        {rows.length ? rows.map((r) => (
          <div key={r.id} className={`ex${r.include ? " on" : ""}`}>
            <input type="checkbox" checked={r.include} onChange={(e) => upd(r.id, { include: e.target.checked })} aria-label="发布这一条" />
            <div className="body">
              <div className="row" style={{ gap: 6 }}>
                {r.kind === "update" ? (
                  <span className="kind k-update">任务进度</span>
                ) : (
                  <select className={`kind k-${r.kind}`} style={{ border: 0, cursor: "pointer" }} value={r.kind} onChange={(e) => upd(r.id, { kind: e.target.value })} aria-label="类型">
                    {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                )}
                {r.kind === "task" && (r.assignee || r.due) ? <span className="muted" style={{ fontSize: 12 }}>{r.assignee ? `负责人：${r.assignee}` : ""}{r.due ? ` · 截止 ${r.due}` : ""}</span> : null}
              </div>
              {r.kind === "update" ? (
                <>
                  <span style={{ fontWeight: 500 }}>{r.title}</span>
                  <span className="s">{r.note}{r.doneSubtasks.length ? ` · 完成：${r.doneSubtasks.join("、")}` : ""}{r.newStatus ? ` · 状态 → ${TASK_STATUS[r.newStatus]}` : ""}</span>
                </>
              ) : (
                <>
                  <input className="title-in" value={r.title} onChange={(e) => upd(r.id, { title: e.target.value })} aria-label="标题" />
                  <input className="title-in s" style={{ fontWeight: 400 }} value={r.body} placeholder="理由（可选）" onChange={(e) => upd(r.id, { body: e.target.value })} aria-label="理由" />
                  {r.subtasks.length ? <span className="s">子任务：{r.subtasks.join(" · ")}</span> : null}
                  {r.sensitive ? <span className="s warn">可能含敏感信息</span> : null}
                </>
              )}
            </div>
          </div>
        )) : <div className="note">没有提炼出结论</div>}
      </div>

      <div className="acts">
        <label className="muted" style={{ fontSize: 12 }} htmlFor="projSel">归入项目</label>
        <select className="select sm" id="projSel" value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">不归入项目</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="grow" />
        <button className="btn ghost" disabled={pending} onClick={() => start(async () => { const r = await discardConversation(conv.id); report(r); if (r.ok) after(); })}>丢弃</button>
        <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await keepPrivate(conv.id); report(r); if (r.ok) after(); })}><Icon name="lock" />仅自己</button>
        <button className="btn pri" disabled={pending} onClick={() => start(async () => {
          const r = await publishConversation(conv.id, rows.map((x) => ({ id: x.id, include: x.include, kind: x.kind === "update" ? undefined : x.kind, title: x.title, body: x.body })), Number(project) || null);
          report(r);
          if (r.ok) after();
        })}>
          {pending ? <span className="spin" /> : null}发布{n ? ` ${n} 条` : ""}
        </button>
      </div>
    </section>
  );
}
