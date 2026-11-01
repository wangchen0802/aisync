"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addPreset, deleteSource, previewPreset, previewSourceAction, runSourceNow, saveSource, setSourceEnabled, type Result } from "@/lib/actions";
import type { Field } from "@/lib/collectors";
import { fmtPay } from "@/lib/format";
import { ActionButton, Dialog, report, toast } from "@/components/client";
import { Icon } from "@/components/ui";

export type DefView = { kind: string; label: string; channel: string; listing?: boolean; help: string; fields: Field[]; missing: string[]; optionalMissing: string[] };
type Preview = { total: number; kept: number; note?: string; sample: { title: string; url: string | null; relevance: number; topics: string[]; pay: { min: number; max: number; unit: string } | null }[] };

function PreviewBox({ p, labels }: { p: Preview; labels: Record<string, string> }) {
  return (
    <div className="note" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ color: "var(--ink)" }}>抓到 {p.total} 条{p.kept !== p.total ? `，过滤后保留 ${p.kept} 条` : ""}{p.note ? ` · ${p.note}` : ""}</b>
      {p.sample.length ? (
        <ul className="preview" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {p.sample.map((s, i) => (
            <li key={i}>
              <span className="rel" style={{ flex: "none" }}>{s.relevance}</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>
              {s.pay ? <span className="pay">{fmtPay(s.pay.min, s.pay.max, s.pay.unit)}</span> : null}
              <span className="faint" style={{ whiteSpace: "nowrap" }}>{s.topics.slice(0, 3).map((t) => labels[t] ?? t).join(" · ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SourceForm({ defs, labels, initial, onDone }: {
  defs: DefView[];
  labels: Record<string, string>;
  initial?: { id: number; kind: string; name: string; every_hours: number; config: Record<string, unknown> };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(initial?.kind ?? defs[0].kind);
  const [name, setName] = useState(initial?.name ?? "");
  const [every, setEvery] = useState(String(initial?.every_hours ?? 24));
  const toStr = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));
  const [config, setConfig] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial?.config ?? {}).map(([k, v]) => [k, toStr(v)])));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();
  const def = defs.find((d) => d.kind === kind)!;
  const set = (k: string, v: string) => { setConfig({ ...config, [k]: v }); setPreview(null); };
  return (
    <div className="stack">
      {!initial ? (
        <label className="field"><span>渠道类型</span>
          <select className="select" value={kind} onChange={(e) => { setKind(e.target.value); setConfig({}); setPreview(null); }}>
            {defs.map((d) => <option key={d.kind} value={d.kind}>{d.label}{d.missing.length ? `（需要 ${d.missing.join("、")}）` : ""}</option>)}
          </select>
        </label>
      ) : null}
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{def.help}</p>
      {def.missing.length ? <div className="note warn">需要先在部署环境变量里配置 {def.missing.join("、")}。</div> : null}
      {def.optionalMissing.length ? <div className="note">建议配置 {def.optionalMissing.join("、")}（可选）。</div> : null}
      <div className="of">
        {def.fields.map((f) => (
          <label key={f.key} className={`field${f.type === "list" || f.key === "query" || f.key === "url" ? " of-wide" : ""}`}>
            <span>{f.label}{f.required ? " *" : ""}</span>
            {f.type === "select" ? (
              <select className="select" value={config[f.key] ?? f.options?.[0]?.[0] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input className="input" type={f.type === "number" ? "number" : "text"} value={config[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
            )}
            {f.help ? <small>{f.help}{f.type === "list" ? "；多个用逗号分隔" : ""}</small> : f.type === "list" ? <small>多个用逗号分隔</small> : null}
          </label>
        ))}
        <label className="field"><span>名称</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="留空自动命名" /></label>
        <label className="field"><span>抓取频率</span>
          <select className="select" value={every} onChange={(e) => setEvery(e.target.value)}>
            {[["6", "每 6 小时"], ["12", "每 12 小时"], ["24", "每天"], ["72", "每 3 天"], ["168", "每周"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <small>Vercel 免费版定时任务每天一次；更高频率需要 Pro 或外部定时器（见 README）</small>
        </label>
      </div>
      {preview ? <PreviewBox p={preview} labels={labels} /> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" disabled={pending || def.missing.length > 0} onClick={() => start(async () => {
          const r = await previewSourceAction(kind, config);
          if (r.ok) setPreview(r.data!); else report(r);
        })}>{pending ? <span className="spin" /> : <Icon name="play" />}试运行</button>
        <button className="btn pri" disabled={pending} onClick={() => start(async () => {
          const r = await saveSource({ id: initial?.id, kind, name, config, every_hours: Number(every) });
          report(r);
          if (r.ok) { router.refresh(); onDone?.(); if (!initial) { setConfig({}); setName(""); setPreview(null); } }
        })}>{initial ? "保存" : "添加渠道"}</button>
      </div>
    </div>
  );
}

export function SourceActions({ source, defs, labels }: { source: { id: number; kind: string; name: string; every_hours: number; enabled: boolean; config: Record<string, unknown> }; defs: DefView[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [pending, start] = useTransition();
  const manual = source.kind === "manual";
  return (
    <span className="row" style={{ gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
      {!manual ? <ActionButton className="btn sm" action={runSourceNow.bind(null, source.id)} title="立即抓取" pendingText="抓取中"><Icon name="play" />运行</ActionButton> : null}
      {!manual ? (
        <button className="sw" role="switch" aria-checked={source.enabled} title={source.enabled ? "暂停" : "启用"} disabled={pending}
          onClick={() => start(async () => { report(await setSourceEnabled(source.id, !source.enabled)); router.refresh(); })} />
      ) : null}
      {!manual ? <button className="btn sm ghost icon" title="编辑" onClick={() => setEdit(true)}><Icon name="edit" /></button> : null}
      {!manual ? <ActionButton className="btn sm ghost icon danger" action={deleteSource.bind(null, source.id)} confirm="删除渠道和它抓到的信号？" title="删除"><Icon name="trash" /></ActionButton> : null}
      {edit ? (
        <Dialog title={`编辑 · ${source.name}`} onClose={() => setEdit(false)} wide>
          <SourceForm defs={defs} labels={labels} initial={source} onDone={() => setEdit(false)} />
        </Dialog>
      ) : null}
    </span>
  );
}

export function PresetButtons({ id, added, verify, labels }: { id: string; added: boolean; verify?: boolean; labels: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isAdded, setAdded] = useState(added);
  const run = (fn: () => Promise<Result<unknown>>) => start(async () => { const r = await fn(); report(r); if (r.ok) { setAdded(true); router.refresh(); } });
  if (isAdded) return <span className="pill ok">已接入</span>;
  return (
    <>
      <button className="btn sm" disabled={pending} title={verify ? "这个 board 名我们没法提前确认，先试运行看看" : "试运行"} onClick={() => start(async () => {
        const r = await previewPreset(id);
        if (r.ok) { setPreview(r.data!); if (!r.data!.total) toast("能访问，但没有返回内容", true); } else report(r);
      })}>{pending ? <span className="spin" /> : null}试运行</button>
      <button className="btn sm pri" disabled={pending} onClick={() => run(() => addPreset(id))}>添加</button>
      {preview ? <div style={{ gridColumn: "2", width: "100%" }}><PreviewBox p={preview} labels={labels} /></div> : null}
    </>
  );
}
