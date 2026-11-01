"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addEvidence, createTheme, setDismissed, setNote, toggleStar } from "@/lib/actions";
import { fmtDate } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/taxonomy";
import { ChannelBadge, Icon, Intent, Pay, Relevance, TopicChips, type TopicMeta } from "@/components/ui";
import { Dialog, report } from "@/components/client";

export type SignalView = {
  id: number; channel: string; url: string | null; title: string; body: string; summary: string; author: string; org: string;
  published_at: string | null; first_seen_at: string; closed_at: string | null; is_listing: boolean; subtype: string; category: string;
  intent: string; topics: string[]; buyers: string[]; vendors: string[]; relevance: number; pay_min: number | null; pay_max: number | null;
  pay_unit: string | null; engine: string; engagement: number; starred: boolean; dismissed: boolean; note: string; source_name: string;
  location: string; themes: { id: number; title: string }[];
};

export function SignalList({ rows, meta, themes }: { rows: SignalView[]; meta: TopicMeta; themes: { id: number; title: string }[] }) {
  return <div className="list">{rows.map((s) => <SignalItem key={s.id} s={s} meta={meta} themes={themes} />)}</div>;
}

export function SignalItem({ s, meta, themes }: { s: SignalView; meta: TopicMeta; themes: { id: number; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [starred, setStarred] = useState(s.starred);
  const [hidden, setHidden] = useState(s.dismissed);
  const [dialog, setDialog] = useState<"" | "theme" | "note">("");
  const text = s.summary || s.body;
  const when = s.published_at ?? s.first_seen_at;
  const orgs = [...new Set([...s.buyers, ...s.vendors])].filter((o) => o !== s.org).slice(0, 4);
  return (
    <article className={`sig${hidden ? " dim" : ""}`} id={`s${s.id}`}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <h3>
          {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : <Link href={`/signals/${s.id}`}>{s.title}</Link>}
        </h3>
        {text && text !== s.title ? <p className="sum">{text}</p> : null}
      </div>
      <div className="acts">
        <button className={`icon-btn${starred ? " on" : ""}`} title={starred ? "取消标星" : "标星：重要，写进周报"} aria-pressed={starred}
          onClick={() => start(async () => { const r = await toggleStar(s.id); if (r.ok) setStarred(Boolean(r.data)); else report(r); })}>
          <Icon name="star" className={`i${starred ? " star-on" : ""}`} />
        </button>
        <button className="icon-btn" title="加到需求假设" onClick={() => setDialog("theme")}><Icon name="bulb" /></button>
        <button className="icon-btn" title="备注" onClick={() => setDialog("note")}><Icon name="note" /></button>
        <button className="icon-btn" title={hidden ? "恢复" : "不相关（隐藏）"} disabled={pending}
          onClick={() => start(async () => { const r = await setDismissed(s.id, !hidden); report(r); if (r.ok) setHidden(!hidden); })}>
          <Icon name={hidden ? "back" : "eyeoff"} />
        </button>
        <Link className="icon-btn" href={`/signals/${s.id}`} title="详情"><Icon name="chev" /></Link>
      </div>
      <div className="foot">
        <ChannelBadge channel={s.channel} />
        <Intent intent={s.intent} />
        {s.category !== "other" && !(s.category === "env" && s.topics.includes("rl_env")) && !(s.category === "eval" && s.topics.includes("eval")) ? <span className="tp" title="类别">{CATEGORY_LABEL[s.category]}</span> : null}
        {s.org ? <span className="org" style={{ fontSize: 12 }}>{s.org}</span> : null}
        {s.is_listing && s.subtype === "expert" ? <span className="tp">专家岗</span> : null}
        <Pay min={s.pay_min} max={s.pay_max} unit={s.pay_unit} />
        <TopicChips keys={s.topics} meta={meta} />
        {orgs.map((o) => <Link key={o} className="tp" href={`/signals?org=${encodeURIComponent(o)}`}>{o}</Link>)}
        {s.closed_at ? <span className="closed-tag">已下架 {fmtDate(s.closed_at)}</span> : null}
        <span className="grow" />
        {s.themes.map((t) => <Link key={t.id} className="tp fmt" href={`/themes/${t.id}`} title="已加入的需求假设">💡 {t.title}</Link>)}
        {s.author ? <span className="faint" style={{ fontSize: 11.5 }}>{s.author}</span> : null}
        {s.engagement > 0 && !s.is_listing ? <span className="faint mono" style={{ fontSize: 11 }} title="互动量">♥ {s.engagement}</span> : null}
        <span className="faint" style={{ fontSize: 11.5 }} title={`首次发现 ${fmtDate(s.first_seen_at)}`}>{fmtDate(when)}</span>
        <Relevance value={s.relevance} />
        {s.engine === "ai" ? <span className="faint" style={{ fontSize: 11 }} title="已由 Claude 分类">AI</span> : null}
      </div>
      {s.note ? <div className="note-l">📝 {s.note}</div> : null}
      {dialog === "theme" ? <ThemeDialog s={s} themes={themes} onClose={() => { setDialog(""); router.refresh(); }} /> : null}
      {dialog === "note" ? <NoteDialog s={s} onClose={() => { setDialog(""); router.refresh(); }} /> : null}
    </article>
  );
}

function ThemeDialog({ s, themes, onClose }: { s: SignalView; themes: { id: number; title: string }[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const linked = new Set(s.themes.map((t) => t.id));
  return (
    <Dialog title="加到需求假设" onClose={onClose}>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>需求假设 = 团队一起验证的一个判断，例如「实验室在大量采购企业 SaaS 的 computer-use 环境」。把信号挂上去当证据。</p>
      {themes.length ? (
        <div className="chips">
          {themes.map((t) => (
            <button key={t.id} className={`chip${linked.has(t.id) ? " chip-on" : ""}`} disabled={pending || linked.has(t.id)}
              onClick={() => start(async () => { report(await addEvidence(t.id, s.id)); onClose(); })}>
              {linked.has(t.id) ? "✓ " : "+ "}{t.title}
            </button>
          ))}
        </div>
      ) : null}
      <div className="field"><span>或新建一个假设</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：编程类 RL 环境需求在上升" />
      </div>
      <textarea className="textarea" value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="为什么这么判断？想怎么验证？（可选）" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn pri" disabled={pending || !title.trim()}
          onClick={() => start(async () => { report(await createTheme({ title, thesis, topics: s.topics.slice(0, 3), signalId: s.id })); onClose(); })}>
          新建并加入
        </button>
      </div>
    </Dialog>
  );
}

function NoteDialog({ s, onClose }: { s: SignalView; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [note, setNoteText] = useState(s.note);
  return (
    <Dialog title="备注" onClose={onClose} footer={<button className="btn pri" disabled={pending} onClick={() => start(async () => { report(await setNote(s.id, note)); onClose(); })}>保存</button>}>
      <textarea className="textarea" autoFocus value={note} onChange={(e) => setNoteText(e.target.value)} placeholder="这条说明了什么？谁去跟进？" />
    </Dialog>
  );
}
