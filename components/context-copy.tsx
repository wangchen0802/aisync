"use client";

import { useState } from "react";
import { CopyButton } from "@/components/client";

export function ContextCopy({ projects }: { projects: { id: number; name: string }[] }) {
  const [p, setP] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const load = async () => {
    const r = await fetch(`/api/context${p ? `?project=${p}` : ""}`);
    if (!r.ok) throw new Error("load failed");
    const t = await r.text();
    setPreview(t);
    return t;
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <select className="select sm" value={p} onChange={(e) => { setP(e.target.value); setPreview(null); }} aria-label="项目">
          <option value="">整个团队</option>
          {projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <CopyButton className="btn sm pri" text={load} label="复制上下文包" done="已复制，粘贴到任何 AI 即可" />
        <button className="btn sm ghost" onClick={() => (preview ? setPreview(null) : load())}>{preview ? "收起预览" : "预览"}</button>
      </div>
      {preview ? <pre className="code" style={{ whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>{preview}</pre> : null}
    </div>
  );
}
