"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addThemeNote, createTheme, updateTheme } from "@/lib/actions";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

export const THEME_STATUS: Record<string, string> = { watching: "观察中", validating: "验证中", building: "在做", parked: "搁置" };

type TopicOpt = { key: string; label: string; grp: string };

function TopicPicker({ topics, value, onChange }: { topics: TopicOpt[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {topics.map((t) => {
        const on = value.includes(t.key);
        return (
          <button key={t.key} type="button" className={`chip${on ? " chip-on" : ""}`} onClick={() => onChange(on ? value.filter((k) => k !== t.key) : [...value, t.key])}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeCreate({ topics }: { topics: TopicOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  if (!open) return <button className="btn pri" onClick={() => setOpen(true)}><Icon name="plus" />新的需求假设</button>;
  return (
    <section className="box pad stack" style={{ width: "100%" }}>
      <label className="field"><span>假设</span><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：实验室在大量采购企业 SaaS 的 computer-use 环境" /></label>
      <label className="field"><span>依据和验证方法</span><textarea className="textarea" value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="看到了什么？什么信号出现就算验证成功 / 失败？" /></label>
      <div className="field"><span>相关方向（用来推荐证据、画趋势）</span><TopicPicker topics={topics} value={picked} onChange={setPicked} /></div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={() => setOpen(false)}>取消</button>
        <button className="btn pri" disabled={pending || !title.trim()} onClick={() => start(async () => {
          const r = await createTheme({ title, thesis, topics: picked });
          report(r);
          if (r.ok) router.push(`/themes/${r.data}`);
        })}>创建</button>
      </div>
    </section>
  );
}

export function ThemeEditor({ theme, topics }: { theme: { id: number; title: string; thesis: string; status: string; next_step: string; topics: string[] }; topics: TopicOpt[] }) {
  const router = useRouter();
  const [t, setT] = useState(theme);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = (patch: Partial<typeof t>) => start(async () => {
    const r = await updateTheme(theme.id, patch);
    report(r);
    if (r.ok) { setEditing(false); router.refresh(); }
  });
  return (
    <section className="box pad stack">
      <div className="seg" role="group" aria-label="状态">
        {Object.entries(THEME_STATUS).map(([k, l]) => (
          <button key={k} aria-pressed={t.status === k} disabled={pending} onClick={() => { setT({ ...t, status: k }); save({ status: k }); }}>{l}</button>
        ))}
      </div>
      {editing ? (
        <>
          <input className="input" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
          <textarea className="textarea" value={t.thesis} onChange={(e) => setT({ ...t, thesis: e.target.value })} placeholder="依据和验证方法" />
          <div className="field"><span>相关方向</span><TopicPicker topics={topics} value={t.topics} onChange={(v) => setT({ ...t, topics: v })} /></div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => { setT(theme); setEditing(false); }}>取消</button>
            <button className="btn pri" disabled={pending} onClick={() => save({ title: t.title, thesis: t.thesis, topics: t.topics })}>保存</button>
          </div>
        </>
      ) : (
        <>
          <h1 className="item-title" style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>{t.title}</h1>
          {t.thesis ? <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{t.thesis}</p> : <p className="muted" style={{ margin: 0 }}>还没有写依据。</p>}
          <div><button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" />编辑</button></div>
        </>
      )}
      <label className="field"><span>下一步（谁、做什么）</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" value={t.next_step} onChange={(e) => setT({ ...t, next_step: e.target.value })} placeholder="例如：找 3 家实验室的 Human Data 负责人聊，确认采购预算" />
          <button className="btn" disabled={pending || t.next_step === theme.next_step} onClick={() => save({ next_step: t.next_step })}>保存</button>
        </div>
      </label>
    </section>
  );
}

export function NoteComposer({ themeId }: { themeId: number }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="composer pad" style={{ borderTop: "1px solid var(--line)" }}>
      <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="补充观察、客户反馈、反对意见…" />
      <button className="btn pri" disabled={pending || !body.trim()} onClick={() => start(async () => {
        const r = await addThemeNote(themeId, body);
        report(r);
        if (r.ok) { setBody(""); router.refresh(); }
      })}><Icon name="send" />发表</button>
    </div>
  );
}
