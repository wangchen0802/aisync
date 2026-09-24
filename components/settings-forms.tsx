"use client";

import { useState, useTransition } from "react";
import { inviteMember, saveProject, saveWorkspace, updateProfile } from "@/lib/actions";
import { PROJECT_COLORS } from "@/lib/meta";
import { report } from "@/components/client";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [v, setV] = useState(name);
  const [pending, start] = useTransition();
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); start(async () => report(await updateProfile(v))); }}>
      <label className="field"><span>显示名称</span><input className="input" value={v} onChange={(e) => setV(e.target.value)} /></label>
      <label className="field"><span>邮箱</span><input className="input" value={email} disabled /></label>
      <div><button className="btn" disabled={pending || v === name}>保存</button></div>
    </form>
  );
}

export function WorkspaceForm({ name, threshold, disabled }: { name: string; threshold: number; disabled: boolean }) {
  const [n, setN] = useState(name);
  const [t, setT] = useState(threshold);
  const [pending, start] = useTransition();
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); start(async () => report(await saveWorkspace({ name: n, threshold: t }))); }}>
      <label className="field"><span>名称</span><input className="input" value={n} onChange={(e) => setN(e.target.value)} disabled={disabled} /></label>
      <label className="field">
        <span>几人同意即生效</span>
        <input className="input" type="number" min={1} max={10} value={t} onChange={(e) => setT(Number(e.target.value))} disabled={disabled} style={{ width: 100 }} />
        <small>含创建者本人</small>
      </label>
      <div><button className="btn" disabled={disabled || pending}>保存</button></div>
    </form>
  );
}

export function ProjectForm({ project, nextColor }: { project?: { id: number; name: string; description: string; color: string }; nextColor?: string }) {
  const [name, setName] = useState(project?.name ?? "");
  const [desc, setDesc] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? nextColor ?? PROJECT_COLORS[0]);
  const [pending, start] = useTransition();
  const dirty = !project || name !== project.name || desc !== project.description || color !== project.color;
  return (
    <form className="row" style={{ alignItems: "flex-start" }} onSubmit={(e) => {
      e.preventDefault();
      start(async () => { const r = await saveProject({ id: project?.id, name, description: desc, color }); report(r); if (r.ok && !project) { setName(""); setDesc(""); setColor(PROJECT_COLORS[(PROJECT_COLORS.indexOf(color) + 1) % 6]); } });
    }}>
      <label className="row" style={{ gap: 4 }} title="颜色">
        {PROJECT_COLORS.slice(0, 6).map((c) => (
          <button type="button" key={c} onClick={() => setColor(c)} aria-label={c} aria-pressed={color === c}
            style={{ width: 16, height: 16, borderRadius: 5, border: 0, background: c, boxShadow: color === c ? `0 0 0 2px var(--panel), 0 0 0 4px ${c}` : "none", padding: 0 }} />
        ))}
      </label>
      <input className="input sm" style={{ width: 170 }} placeholder="项目名" value={name} onChange={(e) => setName(e.target.value)} aria-label="项目名称" />
      <input className="input sm grow" style={{ minWidth: 200 }} placeholder="一句话描述，用于自动归类" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="项目描述" />
      {dirty ? <button className={`btn sm${project ? "" : " pri"}`} disabled={pending || !name.trim()}>{project ? "保存" : "创建项目"}</button> : null}
    </form>
  );
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await inviteMember(email, name); report(r); if (r.ok) { setEmail(""); setName(""); } }); }}>
      <input className="input sm" style={{ width: 240 }} type="email" placeholder="队友邮箱" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="队友邮箱" />
      <input className="input sm" style={{ width: 140 }} placeholder="名字（可选）" value={name} onChange={(e) => setName(e.target.value)} aria-label="名字" />
      <button className="btn sm pri" disabled={pending || !email}>邀请</button>
      <span className="muted" style={{ fontSize: 12 }}>Lark 和团队口令登录无需邀请</span>
    </form>
  );
}
