"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { captureSignal } from "@/lib/actions";
import { INTENT_HELP, INTENT_LABEL } from "@/lib/taxonomy";
import { Dialog, report } from "@/components/client";
import { Icon } from "@/components/ui";

export function CaptureButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <button className="btn pri" onClick={() => setOpen(true)} title="快捷键 C"><Icon name="plus" />收录信号</button>
      {open ? (
        <Dialog title="收录一条需求信号" onClose={() => setOpen(false)} wide>
          <CaptureForm onDone={() => setOpen(false)} />
        </Dialog>
      ) : null}
    </>
  );
}

export function CaptureForm({ initial, onDone }: { initial?: { url?: string; title?: string; text?: string }; onDone?: (id?: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(initial?.url ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  const [intent, setIntent] = useState("");
  const [org, setOrg] = useState("");
  const [note, setNote] = useState("");
  const submit = () =>
    start(async () => {
      const r = await captureSignal({ url, title, text, intent, note, org });
      report(r);
      if (r.ok) {
        router.refresh();
        onDone?.(r.data);
      }
    });
  return (
    <div className="stack" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        X / LinkedIn / 微信群 / 客户对话里看到的需求，贴进来。会自动识别领域、实验室、数据商和薪资，并标星进入周报。
      </p>
      <label className="field"><span>链接</span><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://x.com/…（可选）" /></label>
      <label className="field"><span>标题</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话：谁需要什么（可选，留空用内容第一行）" /></label>
      <label className="field"><span>内容</span><textarea className="textarea" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="原文 / 对话要点" /></label>
      <div className="two">
        <label className="field"><span>类型</span>
          <select className="select" value={intent} onChange={(e) => setIntent(e.target.value)}>
            <option value="">自动识别</option>
            {Object.entries(INTENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l} — {INTENT_HELP[k]}</option>)}
          </select>
        </label>
        <label className="field"><span>相关公司</span><input className="input" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="例如 OpenAI（可选）" /></label>
      </div>
      <label className="field"><span>我的判断</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="这说明了什么 / 谁跟进（可选）" /></label>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="faint" style={{ fontSize: 12 }}><kbd>⌘</kbd> + <kbd>Enter</kbd> 收录 · 任意页面按 <kbd>C</kbd></span>
        <button className="btn pri" disabled={pending} onClick={submit}>{pending ? <span className="spin" /> : <Icon name="check" />}收录</button>
      </div>
    </div>
  );
}
