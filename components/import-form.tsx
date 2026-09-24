"use client";

import { useActionState, useEffect, useState } from "react";
import { importConversation, type Result } from "@/lib/actions";
import { SOURCES, type SourceKey } from "@/lib/meta";
import { toast } from "@/components/client";
import { Icon } from "@/components/ui";

const PICK = ["chatgpt", "claude", "deepseek", "gemini", "grok", "perplexity", "kimi", "doubao", "qwen", "claudecode", "cursor", "copilot", "other"] as const;

function detectSource(text: string, url: string): SourceKey | null {
  const hay = `${url} ${text.slice(0, 3000)}`.toLowerCase();
  for (const k of PICK) {
    const hosts = SOURCES[k].hosts;
    if (hosts?.some((h) => hay.includes(h))) return k;
  }
  if (/chatgpt|gpt-4|gpt-5/.test(hay)) return "chatgpt";
  if (/deepseek/.test(hay)) return "deepseek";
  if (/\bclaude\b/.test(hay)) return "claude";
  if (/gemini/.test(hay)) return "gemini";
  if (/\bgrok\b/.test(hay)) return "grok";
  return null;
}

export function ImportForm({ projects, initial }: { projects: { id: number; name: string }[]; initial: { title: string; text: string; url: string } }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(importConversation, null);
  const firstUrl = initial.url || initial.text.match(/https?:\/\/\S+/)?.[0] || "";
  const [text, setText] = useState(initial.text);
  const [url, setUrl] = useState(firstUrl);
  const [source, setSource] = useState<string>(detectSource(initial.text, firstUrl) ?? "chatgpt");
  const [touched, setTouched] = useState(false);
  const onlyLink = /^\s*https?:\/\/\S+\s*$/.test(text);

  useEffect(() => {
    if (touched) return;
    const d = detectSource(text, url);
    if (d) setSource(d);
  }, [text, url, touched]);

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast("剪贴板是空的", true);
      setText(t);
      const u = t.match(/https?:\/\/\S+/)?.[0];
      if (u && !url) setUrl(u);
    } catch {
      toast("浏览器不允许读取剪贴板，请长按输入框粘贴", true);
    }
  };

  return (
    <form action={action} className="box pad stack" style={{ gap: 14 }}>
      <div className="field">
        <span>来源</span>
        <div className="row src-pick" style={{ gap: 6 }}>
          {PICK.map((k) => (
            <button type="button" key={k} className="chip" onClick={() => { setSource(k); setTouched(true); }}
              style={source === k ? { borderColor: "var(--ink)", boxShadow: "0 0 0 1px var(--ink)", color: "var(--ink)" } : undefined}>
              <span className="pv only" style={{ marginRight: 6, verticalAlign: -3 }}><i style={{ background: SOURCES[k].color, width: 15, height: 15, fontSize: 8.5 }}>{SOURCES[k].abbr}</i></span>
              {SOURCES[k].name}
            </button>
          ))}
        </div>
        <input type="hidden" name="source" value={source} />
      </div>
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>对话内容</span>
          <button type="button" className="btn sm" onClick={paste}><Icon name="copy" />粘贴</button>
        </div>
        <textarea name="text" className="textarea" style={{ minHeight: 260, fontSize: 13 }} required value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"粘贴整段对话（在 AI 页面 ⌘A 全选后复制）\n密钥、密码、手机号会自动打码"} />
        <small>{text.length ? `${text.length.toLocaleString()} 字` : ""}</small>
      </div>
      {onlyLink ? <div className="note warn">分享链接读不到内容，请打开链接复制对话后粘贴。</div> : null}
      <div className="two">
        <label className="field"><span>标题（可选）</span><input name="title" className="input" placeholder="自动生成" defaultValue={initial.title} /></label>
        <label className="field"><span>项目（可选）</span>
          <select name="projectId" className="select" defaultValue="">
            <option value="">自动判断</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <input type="hidden" name="url" value={url} />
      {state && !state.ok ? <div className="note err">{state.error}</div> : null}
      <div className="row">
        <button className="btn pri lg" disabled={pending || onlyLink}>{pending ? <><span className="spin" />正在提炼共识与任务…</> : "提炼"}</button>
        <span className="muted" style={{ fontSize: 12 }}>约 20 秒</span>
      </div>
    </form>
  );
}
