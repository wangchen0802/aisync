"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import type { Result } from "@/lib/actions";
import { createItem, object as objectAction } from "@/lib/actions";
import { code, DECISION_STATUS, KIND_LABEL, TASK_STATUS } from "@/lib/meta";

/* ───────── toasts ───────── */

type ToastMsg = { id: number; text: string; err?: boolean };
export function toast(text: string, err = false) {
  window.dispatchEvent(new CustomEvent("simreal:toast", { detail: { text, err } }));
}
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; err?: boolean };
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, ...d }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.err ? 5000 : 2600);
    };
    window.addEventListener("simreal:toast", on);
    return () => window.removeEventListener("simreal:toast", on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast${t.err ? " err" : ""}`}>
          <Icon name={t.err ? "alert" : "check"} />
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function report(r: Result | undefined) {
  if (!r) return;
  if (r.ok) {
    if (r.message) toast(r.message);
  } else toast(r.error, true);
}

/* ───────── action button ───────── */

export function ActionButton({
  action, children, className = "btn sm", title, confirm,
}: { action: () => Promise<Result>; children: React.ReactNode; className?: string; title?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const go = () => start(async () => report(await action()));
  if (asking)
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>{confirm}</span>
        <button className="btn sm danger" onClick={() => { setAsking(false); go(); }}>确定</button>
        <button className="btn sm ghost" onClick={() => setAsking(false)}>取消</button>
      </span>
    );
  return (
    <button className={className} title={title} disabled={pending} onClick={() => (confirm ? setAsking(true) : go())}>
      {pending ? <span className="spin" /> : null}
      {children}
    </button>
  );
}

/* ───────── nav ───────── */

export function NavLink({ href, icon, label, count, hot }: { href: string; icon: string; label: string; count?: number; hot?: boolean }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link className="nv" href={href} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span>{label}</span>
      {count ? <span className={`n${hot ? " hot" : ""}`}>{count}</span> : null}
    </Link>
  );
}

/* ───────── detail level ───────── */

export function DetailToggle({ initial }: { initial: string }) {
  const [level, setLevel] = useState(initial);
  const set = (l: string) => {
    setLevel(l);
    document.querySelector("[data-detail]")?.setAttribute("data-detail", l);
    document.cookie = `detail=${l}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="muted" style={{ fontSize: 12 }}>细节</span>
      <div className="seg" role="group" aria-label="细节程度">
        {[["lite", "精简"], ["std", "标准"], ["full", "完整"]].map(([k, l]) => (
          <button key={k} aria-pressed={level === k} onClick={() => set(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/** Toggles details open for the enclosing item, regardless of the global detail level. */
export function Expander({ label = "细节" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className="more more-toggle"
      aria-expanded={open}
      onClick={() => {
        const host = ref.current?.closest("[data-x]");
        host?.classList.toggle("xopen", !open);
        setOpen(!open);
      }}
    >
      <Icon name="chev" />
      {open ? "收起" : label}
    </button>
  );
}

/* ───────── copy ───────── */

export function CopyButton({ text, label = "复制", className = "btn sm", done = "已复制" }: { text: string | (() => Promise<string>); label?: string; className?: string; done?: string }) {
  return (
    <button
      className={className}
      onClick={async () => {
        try {
          const t = typeof text === "string" ? text : await text();
          await navigator.clipboard.writeText(t);
          toast(done);
        } catch {
          toast("复制失败，请手动选中复制", true);
        }
      }}
    >
      <Icon name="copy" />
      {label}
    </button>
  );
}

/* ───────── object (dissent) ───────── */

export function ObjectButton({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button className="btn sm" onClick={() => setOpen(true)}>提出异议</button>;
  return (
    <span className="row" style={{ flex: "1 1 100%" }}>
      <input className="input sm grow" autoFocus placeholder="说说你的顾虑（会通知创建者）" value={text} onChange={(e) => setText(e.target.value)} style={{ minWidth: 200 }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      <button className="btn sm pri" disabled={pending || !text.trim()} onClick={() => start(async () => { report(await objectAction(id, text)); setOpen(false); setText(""); })}>
        {pending ? <span className="spin" /> : null}提交
      </button>
      <button className="btn sm ghost" onClick={() => setOpen(false)}>取消</button>
    </span>
  );
}

/* ───────── dialog ───────── */

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <div className="dialog-h"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="关闭"><Icon name="x" /></button></div>
        <div className="dialog-b">{children}</div>
        {footer ? <div className="dialog-f">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ───────── new item ───────── */

type Opt = { id: number; name: string };
export function NewItemButton({
  kind: initialKind = "decision", projects, members, decisions = [], defaultProject, label, className = "btn pri",
}: { kind?: string; projects: Opt[]; members: Opt[]; decisions?: { id: number; title: string }[]; defaultProject?: number | null; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [project, setProject] = useState<string>(defaultProject ? String(defaultProject) : "");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [subs, setSubs] = useState("");
  const [blocked, setBlocked] = useState("");
  const [pending, start] = useTransition();
  const close = useCallback(() => setOpen(false), []);
  const submit = () =>
    start(async () => {
      const r = await createItem({
        kind, title, body, projectId: Number(project) || null, assigneeId: Number(assignee) || null, due,
        subtasks: subs.split("\n").map((s) => s.trim()).filter(Boolean), blockedBy: Number(blocked) || null,
      });
      report(r);
      if (r.ok) { setOpen(false); setTitle(""); setBody(""); setSubs(""); setDue(""); setBlocked(""); }
    });
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}><Icon name="plus" />{label ?? `新建${KIND_LABEL[initialKind as keyof typeof KIND_LABEL]}`}</button>
      {open ? (
        <Dialog title={`新建${KIND_LABEL[kind as keyof typeof KIND_LABEL]}`} onClose={close}
          footer={<><button className="btn ghost" onClick={close}>取消</button><button className="btn pri" disabled={pending || !title.trim()} onClick={submit}>{pending ? <span className="spin" /> : null}创建</button></>}>
          <div className="seg" role="group" style={{ alignSelf: "flex-start" }}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          <label className="field"><span>{kind === "decision" ? "决策（一句话结论）" : "标题"}</span>
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "decision" ? "例如：MVP 用 Postgres，不引入独立向量库" : kind === "task" ? "例如：完成结算页" : ""} onKeyDown={(e) => e.key === "Enter" && title.trim() && submit()} />
          </label>
          <label className="field"><span>{kind === "decision" ? "理由" : "补充说明"}</span>
            <textarea className="textarea" style={{ minHeight: 64 }} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
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
            ) : null}
          </div>
          {kind === "task" ? (
            <>
              <div className="two">
                <label className="field"><span>截止</span><input className="input" value={due} onChange={(e) => setDue(e.target.value)} placeholder="例如：周五" /></label>
                <label className="field"><span>依赖某条决策（未确认前为阻塞）</span>
                  <select className="select" value={blocked} onChange={(e) => setBlocked(e.target.value)}>
                    <option value="">无</option>
                    {decisions.map((d) => <option key={d.id} value={d.id}>{code("decision", d.id)} {d.title.slice(0, 24)}</option>)}
                  </select>
                </label>
              </div>
              <label className="field"><span>子任务（每行一个）</span><textarea className="textarea" style={{ minHeight: 70 }} value={subs} onChange={(e) => setSubs(e.target.value)} /></label>
            </>
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}

/* ───────── command palette ───────── */

type Hit = { id: number; kind: string; title: string; status: string; owner: string | null };
const NAV_ITEMS: [string, string, string][] = [
  ["/", "总览", "home"], ["/consensus", "共识", "cons"], ["/tasks", "任务进度", "task"], ["/activity", "动态", "act"],
  ["/inbox", "收件箱", "inbox"], ["/import", "导入对话", "plus"], ["/ask", "问团队记忆", "ask"], ["/digest", "每日简报", "news"],
  ["/connect", "连接 AI", "plug"], ["/settings", "设置", "gear"],
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const o = () => setOpen(true);
    window.addEventListener("keydown", k);
    window.addEventListener("simreal:palette", o);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("simreal:palette", o); };
  }, []);

  useEffect(() => {
    if (!open) { setQ(""); setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) setHits(await r.json());
      } catch { /* aborted */ }
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const nav = NAV_ITEMS.filter(([, l]) => !q || l.includes(q));
  const items: { group: string; key: string; node: React.ReactNode; run: () => void }[] = [
    ...(q.trim() ? [{ group: "问团队记忆", key: "ask", node: <><Icon name="ask" /><span className="t">问：“{q}”</span></>, run: () => router.push(`/ask?q=${encodeURIComponent(q)}`) }] : []),
    ...hits.map((h) => ({
      group: "共识与任务", key: `h${h.id}`,
      node: <><Icon name={h.kind === "task" ? "task" : "cons"} /><span className="ref">{code(h.kind, h.id)}</span><span className="t">{h.title}</span><small>{h.kind === "task" ? TASK_STATUS[h.status] : DECISION_STATUS[h.status] ?? ""}{h.owner ? ` · ${h.owner}` : ""}</small></>,
      run: () => router.push(`/item/${h.id}`),
    })),
    ...nav.map(([href, l, i]) => ({ group: "跳转", key: href, node: <><Icon name={i} /><span className="t">{l}</span></>, run: () => router.push(href) })),
  ];
  const pick = (i: number) => { const it = items[i]; if (it) { setOpen(false); it.run(); } };

  if (!open) return null;
  let last = "";
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="dialog" role="dialog" aria-label="命令面板" style={{ maxWidth: 620 }}>
        <div className="pal-i">
          <Icon name="search" style={{ color: "var(--muted)" }} />
          <input
            autoFocus placeholder="搜索共识、任务，或输入问题…" value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(sel); }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="pal-l" ref={listRef}>
          {items.length ? items.map((it, i) => {
            const head = it.group !== last ? <div className="pal-g">{(last = it.group)}</div> : null;
            return (
              <div key={it.key}>
                {head}
                <button className="po" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>{it.node}</button>
              </div>
            );
          }) : <div className="empty">没有找到结果</div>}
        </div>
        <div className="pal-f"><span>↑↓ 选择</span><span>↵ 打开</span><span>esc 关闭</span></div>
      </div>
    </div>
  );
}

export function OpenPalette() {
  return (
    <button className="search-btn" onClick={() => window.dispatchEvent(new Event("simreal:palette"))}>
      <Icon name="search" /><span>搜索或跳转…</span><kbd>⌘K</kbd>
    </button>
  );
}

/** Keeps server data fresh when the tab regains focus. */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const on = () => { if (document.visibilityState === "visible" && Date.now() - last > 15_000) { last = Date.now(); router.refresh(); } };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [router]);
  return null;
}

const TITLES: Record<string, string> = Object.fromEntries(NAV_ITEMS.map(([href, label]) => [href, label]));
export function Crumb({ ws }: { ws: string }) {
  const path = usePathname();
  const key = "/" + (path.split("/")[1] ?? "");
  const label = key === "/" ? "总览" : key === "/item" ? `#${path.split("/")[2] ?? ""}` : TITLES[key];
  return (
    <div className="crumb">
      {ws}
      {label ? <><Icon name="chev" className="i sm" /><b>{label}</b></> : null}
    </div>
  );
}
