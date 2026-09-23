"use client";

import { useActionState, useState } from "react";
import { importConversation, type Result } from "@/lib/actions";
import { SOURCES } from "@/lib/meta";

const PICK = ["chatgpt", "claude", "deepseek", "gemini", "grok", "perplexity", "kimi", "doubao", "qwen", "claudecode", "cursor", "copilot", "other"] as const;

export function ImportForm({ projects }: { projects: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(importConversation, null);
  const [source, setSource] = useState("chatgpt");
  const [len, setLen] = useState(0);
  return (
    <form action={action} className="box pad stack" style={{ gap: 14 }}>
      <div className="field">
        <span>来自哪个 AI</span>
        <div className="row" style={{ gap: 6 }}>
          {PICK.map((k) => (
            <button type="button" key={k} className="chip" onClick={() => setSource(k)}
              style={source === k ? { borderColor: "var(--ink)", boxShadow: "0 0 0 1px var(--ink)", color: "var(--ink)" } : undefined}>
              <span className="pv only" style={{ marginRight: 6, verticalAlign: -3 }}><i style={{ background: SOURCES[k].color, width: 15, height: 15, fontSize: 8.5 }}>{SOURCES[k].abbr}</i></span>
              {SOURCES[k].name}
            </button>
          ))}
        </div>
        <input type="hidden" name="source" value={source} />
      </div>
      <label className="field">
        <span>对话内容</span>
        <textarea name="text" className="textarea" style={{ minHeight: 280, fontSize: 13 }} required
          placeholder={"在 AI 页面全选（⌘A / Ctrl+A）复制整段对话，粘贴到这里。\n也可以只粘贴关键部分。API Key、密码、手机号会自动打码。"}
          onChange={(e) => setLen(e.target.value.length)} />
        <small>{len ? `${len.toLocaleString()} 字符` : "支持很长的对话"}</small>
      </label>
      <div className="two">
        <label className="field"><span>标题（可选）</span><input name="title" className="input" placeholder="不填会自动生成" /></label>
        <label className="field"><span>项目（可选）</span>
          <select name="projectId" className="select" defaultValue="">
            <option value="">让 AI 自动判断</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <input type="hidden" name="url" value="" />
      {state && !state.ok ? <div className="note err">{state.error}</div> : null}
      <div className="row">
        <button className="btn pri lg" disabled={pending}>{pending ? <><span className="spin" />正在提炼共识与任务…</> : "提炼并放入收件箱"}</button>
        <span className="muted" style={{ fontSize: 12 }}>通常需要 10–30 秒</span>
      </div>
    </form>
  );
}
