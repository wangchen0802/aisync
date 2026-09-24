"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createItem, logout } from "@/lib/actions";
import { KIND_LABEL } from "@/lib/meta";
import { DetailToggle, Dialog, report } from "@/components/client";
import { Avatar, Icon, LogoMark } from "@/components/ui";

type Opt = { id: number; name: string };

export const openCapture = () => window.dispatchEvent(new Event("simreal:capture"));
const openPalette = () => window.dispatchEvent(new Event("simreal:palette"));

/* ───────── mobile top bar + "more" sheet ───────── */

export function MobileTop({ ws, me, inbox, detail }: { ws: string; me: { id: number; name: string; image: string | null }; inbox: number; detail: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const links: [string, string, string, number?][] = [
    ["/ideas", "想法", "edit"], ["/memory", "记忆 · 问团队", "ask"], ["/activity", "动态", "act"], ["/digest", "每日简报", "news"],
    ["/import", "导入对话", "plus"], ["/connect", "连接 AI", "plug"], ["/settings", "设置", "gear"],
  ];
  return (
    <>
      <header className="mtop">
        <Link href="/" className="row" style={{ gap: 8 }}><LogoMark size={24} /><b>{ws}</b></Link>
        <span className="grow" />
        <button className="btn ghost icon" aria-label="搜索" onClick={openPalette}><Icon name="search" /></button>
        <button className="btn ghost icon mtop-me" aria-label="更多" onClick={() => setOpen(true)}><Avatar id={me.id} name={me.name} image={me.image} />{inbox ? <span className="me-dot" /> : null}</button>
      </header>
      {open ? (
        <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dialog sheet" role="dialog" aria-label="更多">
            <div className="sheet-grip" />
            <div className="dialog-b" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 10, padding: "4px 4px 10px" }}>
                <Avatar id={me.id} name={me.name} image={me.image} lg /><b style={{ fontWeight: 600 }}>{me.name}</b>
                <span className="grow" />
                <form action={logout}><button className="btn sm ghost"><Icon name="out" />退出</button></form>
              </div>
              <Link className="nv big" href="/inbox"><Icon name="inbox" /><span>收件箱</span>{inbox ? <span className="n hot">{inbox}</span> : null}</Link>
              {links.map(([href, label, icon]) => <Link key={href} className="nv big" href={href}><Icon name={icon} /><span>{label}</span></Link>)}
              <div className="row" style={{ padding: "12px 4px 4px", borderTop: "1px solid var(--line)", marginTop: 8 }}><DetailToggle initial={detail} /></div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ───────── bottom tab bar ───────── */

export function TabBar({ attention, dueSoon }: { attention: number; dueSoon: number }) {
  const path = usePathname();
  const tab = (href: string, icon: string, label: string, count?: number) => {
    const active = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
        <span className="tab-ic"><Icon name={icon} />{count ? <span className="tab-badge">{count > 9 ? "9+" : count}</span> : null}</span>
        <span>{label}</span>
      </Link>
    );
  };
  return (
    <nav className="tabbar" aria-label="底部导航">
      {tab("/", "home", "总览")}
      {tab("/week", "bolt", "本周", dueSoon)}
      <button className="tab-fab" onClick={openCapture} aria-label="快速记录"><Icon name="plus" /></button>
      {tab("/tasks", "task", "任务")}
      {tab("/consensus", "cons", "共识", attention)}
    </nav>
  );
}

/* ───────── quick capture ───────── */

function guessKind(t: string) {
  if (/[?？]\s*$/.test(t) || /^(是否|要不要|该不该)/.test(t)) return "question";
  if (/(负责|TODO|待办|截止|之前完成|前完成|跟进|要做|去做|todo)/i.test(t)) return "task";
  if (/(决定|确定|采用|选用|定为|就用|不做|改为|统一用)/.test(t)) return "decision";
  if (/(发现|数据显示|调研|竞品|用户反馈|\d+%)/.test(t)) return "insight";
  if (/(想法|也许|或许|要不要试|感觉|灵感|脑暴)/.test(t)) return "idea";
  return "";
}

export function QuickCapture({ projects, members }: { projects: Opt[]; members: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [project, setProject] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const guessed = useMemo(() => guessKind(text), [text]);
  const kind = picked || guessed || "decision";
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const o = () => {
      setOpen(true);
      try { setProject(localStorage.getItem("simreal.lastProject") ?? ""); } catch { /* storage blocked */ }
    };
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); o(); }
    };
    if (new URLSearchParams(location.search).get("capture")) o();
    window.addEventListener("simreal:capture", o);
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("simreal:capture", o); window.removeEventListener("keydown", k); };
  }, []);

  const submit = () => {
    const [first, ...rest] = text.trim().split("\n");
    if (!first) return;
    start(async () => {
      const r = await createItem({ kind, title: first.slice(0, 200), body: rest.join("\n").trim(), projectId: Number(project) || null, assigneeId: Number(assignee) || null, dueDate: kind === "task" ? due || null : null });
      report(r);
      if (r.ok) {
        try { localStorage.setItem("simreal.lastProject", project); } catch { /* storage blocked */ }
        setText(""); setPicked(""); setDue(""); setOpen(false);
      }
    });
  };

  if (!open) return null;
  return (
    <Dialog title="快速记录" onClose={close}
      footer={<>
        <Link className="btn ghost" href="/import" onClick={close} style={{ marginRight: "auto" }}>导入整段对话</Link>
        <button className="btn pri" disabled={pending || !text.trim()} onClick={submit}>{pending ? <span className="spin" /> : null}记录{KIND_LABEL[kind as keyof typeof KIND_LABEL]}</button>
      </>}>
      <textarea
        className="textarea" autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="内容"
        placeholder={"例如：MVP 先不做 SSO\n或：Bob 周五前完成结算页"}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }}
      />
      <div className="row" style={{ gap: 6 }}>
        {Object.entries(KIND_LABEL).map(([k, l]) => (
          <button key={k} className={`chip kind-chip${kind === k ? " on" : ""}`} onClick={() => setPicked(k)} aria-pressed={kind === k}>
            <span className={`kind k-${k}`} style={{ padding: 0, background: "none" }}>{l}</span>
          </button>
        ))}
        {!picked && guessed ? <span className="muted" style={{ fontSize: 11.5 }}>自动</span> : null}
      </div>
      <div className="two">
        <label className="field"><span>项目</span>
          <select className="select" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">不归入项目</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {kind === "task" ? (
          <label className="field"><span>负责人</span>
            <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">我自己</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        ) : <div />}
      </div>
      {kind === "task" ? (
        <label className="field"><span>DDL</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      ) : null}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>第一行是标题，其余是补充说明。{kind === "decision" ? "决策发出后会请队友确认。" : kind === "idea" ? "想法默认只有你自己可见。" : ""} <kbd>⌘</kbd>+<kbd>Enter</kbd> 发送 · 任意页面按 <kbd>C</kbd> 打开</p>
    </Dialog>
  );
}
