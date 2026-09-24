"use client";

import { useActionState, useEffect, useState } from "react";
import { importConversation, type Result } from "@/lib/actions";
import { SOURCES, type SourceKey } from "@/lib/meta";
import { CopyButton, toast } from "@/components/client";
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

export function ImportForm({ projects, initial, selfPrompt }: { projects: { id: number; name: string }[]; initial: { title: string; text: string; url: string }; selfPrompt?: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(importConversation, null);
  const firstUrl = initial.url || initial.text.match(/https?:\/\/\S+/)?.[0] || "";
  const [text, setText] = useState(initial.text);
  const [url, setUrl] = useState(firstUrl);
  const [source, setSource] = useState<string>(detectSource(initial.text, firstUrl) ?? "chatgpt");
  const [touched, setTouched] = useState(false);
  const onlyLink = /^\s*https?:\/\/\S+\s*$/.test(text);
  const structured = text.includes('"simreal_sync"');

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
      {selfPrompt ? (
        <div className="byo">
          <div className="byo-t"><b>让你的 AI 自己整理</b><span className="muted">用 ChatGPT / Claude / DeepSeek 订阅，不需要 API</span></div>
          <ol className="byo-s">
            <li><CopyButton className="btn sm pri" text={selfPrompt} label="复制整理指令" done="已复制" /> 发到你和 AI 的那个对话里</li>
            <li>AI 回复一段 JSON 后，把整段对话（或只是那段回复）复制过来粘贴到下面</li>
          </ol>
        </div>
      ) : null}
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>对话内容{structured ? <span className="pill ok" style={{ marginLeft: 8 }}>✓ 已识别 AI 的整理结果</span> : null}</span>
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
        <button className="btn pri lg" disabled={pending || onlyLink}>{pending ? <><span className="spin" />{structured ? "正在同步…" : "正在提炼…"}</> : structured ? "同步" : "提炼"}</button>
        {!structured && selfPrompt ? <span className="muted" style={{ fontSize: 12 }}>直接粘贴也可以，按关键词提取，准确度一般</span> : null}
      </div>
    </form>
  );
}
