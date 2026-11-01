"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveTopic, saveSettings, saveTopic, testNotify } from "@/lib/actions";
import { report } from "@/components/client";
import { Icon } from "@/components/ui";

type S = Record<string, string>;

export function SettingsForm({ initial, keys }: { initial: S; keys: { key: string; label: string; help?: string; type?: "text" | "number" | "toggle" | "textarea"; placeholder?: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState<S>(initial);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="kv">
        {keys.map((k) => (
          <FieldRow key={k.key} k={k} value={v[k.key] ?? ""} onChange={(x) => setV({ ...v, [k.key]: x })} />
        ))}
      </div>
      <div className="dialog-f">
        <button className="btn pri" disabled={pending} onClick={() => start(async () => {
          report(await saveSettings(Object.fromEntries(keys.map((k) => [k.key, v[k.key] ?? ""]))));
          router.refresh();
        })}>保存</button>
      </div>
    </div>
  );
}

function FieldRow({ k, value, onChange }: { k: { key: string; label: string; help?: string; type?: string; placeholder?: string }; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <span>{k.label}{k.help ? <small className="faint" style={{ display: "block", fontSize: 11.5 }}>{k.help}</small> : null}</span>
      {k.type === "toggle" ? (
        <button className="sw" role="switch" aria-checked={value !== "off"} onClick={() => onChange(value === "off" ? "on" : "off")} />
      ) : k.type === "textarea" ? (
        <textarea className="textarea" value={value} placeholder={k.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" type={k.type === "number" ? "number" : "text"} value={value} placeholder={k.placeholder} onChange={(e) => onChange(e.target.value)} style={k.type === "number" ? { maxWidth: 120 } : undefined} />
      )}
    </>
  );
}

export function TestNotify() {
  const [pending, start] = useTransition();
  return <button className="btn sm" disabled={pending} onClick={() => start(async () => report(await testNotify()))}>{pending ? <span className="spin" /> : <Icon name="send" />}发一条测试消息</button>;
}

export function TopicRow({ t }: { t: { key: string; label: string; grp: string; keywords: string[] } }) {
  const router = useRouter();
  const [label, setLabel] = useState(t.label);
  const [kw, setKw] = useState(t.keywords.join(", "));
  const [pending, start] = useTransition();
  const dirty = label !== t.label || kw !== t.keywords.join(", ");
  return (
    <div className="topic-ed">
      <div className="stack" style={{ gap: 4 }}>
        <input className="input sm" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: "100%" }} />
        <span className="faint mono" style={{ fontSize: 11 }}>{t.key} · {t.grp === "format" ? "数据形态" : "领域"}</span>
      </div>
      <textarea className="textarea" value={kw} onChange={(e) => setKw(e.target.value)} />
      <div className="stack" style={{ gap: 4 }}>
        <button className="btn sm pri" disabled={pending || !dirty} onClick={() => start(async () => { report(await saveTopic({ key: t.key, label, grp: t.grp, keywords: kw })); router.refresh(); })}>保存</button>
        <button className="btn sm ghost" disabled={pending} onClick={() => start(async () => { report(await archiveTopic(t.key)); router.refresh(); })}>隐藏</button>
      </div>
    </div>
  );
}

export function NewTopic() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [grp, setGrp] = useState("domain");
  const [kw, setKw] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}><Icon name="plus" />新主题</button>;
  return (
    <div className="topic-ed" style={{ borderTop: 0, background: "var(--subtle)", borderRadius: 10 }}>
      <div className="stack" style={{ gap: 4 }}>
        <input className="input sm" placeholder="名称，如：保险" value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: "100%" }} />
        <input className="input sm mono" placeholder="key，如：insurance" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: "100%" }} />
        <select className="select sm" value={grp} onChange={(e) => setGrp(e.target.value)} style={{ width: "100%" }}>
          <option value="domain">领域</option>
          <option value="format">数据形态</option>
        </select>
      </div>
      <textarea className="textarea" placeholder="关键词，逗号分隔：insurance, underwriting, claims, 保险, 核保" value={kw} onChange={(e) => setKw(e.target.value)} />
      <div className="stack" style={{ gap: 4 }}>
        <button className="btn sm pri" disabled={pending || !key || !label} onClick={() => start(async () => {
          const r = await saveTopic({ key, label, grp, keywords: kw });
          report(r);
          if (r.ok) { setOpen(false); setKey(""); setLabel(""); setKw(""); router.refresh(); }
        })}>添加</button>
        <button className="btn sm ghost" onClick={() => setOpen(false)}>取消</button>
      </div>
    </div>
  );
}

/** React blocks javascript: URLs in JSX, so the bookmarklet href is set on the DOM node directly. */
export function BookmarkletLink({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <a
      className="btn sm pri"
      ref={(el) => { if (el) el.setAttribute("href", code); }}
      onClick={(e) => { e.preventDefault(); }}
      title="拖到书签栏"
    >
      {children}
    </a>
  );
}
