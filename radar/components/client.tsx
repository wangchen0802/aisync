"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Result } from "@/lib/actions";
import { Icon } from "@/components/ui";

type ToastMsg = { id: number; text: string; err?: boolean };

export function toast(text: string, err = false) {
  window.dispatchEvent(new CustomEvent("radar:toast", { detail: { text, err } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { text: string; err?: boolean };
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-2), { id, ...d }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), d.err ? 6000 : 3000);
    };
    window.addEventListener("radar:toast", on);
    return () => window.removeEventListener("radar:toast", on);
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

export function report<T>(r: Result<T> | undefined) {
  if (!r) return;
  if (r.ok) {
    if (r.message) toast(r.message);
  } else toast(r.error, true);
}

export function ActionButton<T>({
  action, children, className = "btn sm", title, confirm, pendingText,
}: { action: () => Promise<Result<T>>; children: React.ReactNode; className?: string; title?: string; confirm?: string; pendingText?: string }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const router = useRouter();
  const go = () => start(async () => {
    report(await action());
    router.refresh();
  });
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
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

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

export function CopyButton({ text, label = "复制", className = "btn sm", done = "已复制" }: { text: string | (() => Promise<string>); label?: React.ReactNode; className?: string; done?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const t = typeof text === "string" ? text : await text();
          await navigator.clipboard.writeText(t);
          toast(done);
        } catch {
          toast("复制失败，请手动选中复制", true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spin" /> : <Icon name="copy" />}
      {label}
    </button>
  );
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title} style={wide ? { maxWidth: 720 } : undefined}>
        <div className="dialog-h">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="关闭"><Icon name="x" /></button>
        </div>
        <div className="dialog-b">{children}</div>
        {footer ? <div className="dialog-f">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Copies a context pack, then opens Claude / ChatGPT so the user can paste it into their own subscription. */
export function AnalyzeIn({ getText }: { getText: () => Promise<Result<string>> }) {
  const [busy, setBusy] = useState("");
  const go = async (where: "claude" | "chatgpt") => {
    setBusy(where);
    try {
      const r = await getText();
      if (!r.ok) return toast(r.error, true);
      await navigator.clipboard.writeText(r.data ?? "");
      toast("已复制雷达上下文，在打开的对话里粘贴即可");
      window.open(where === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/", "_blank", "noopener");
    } catch {
      toast("复制失败", true);
    } finally {
      setBusy("");
    }
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn sm" disabled={Boolean(busy)} onClick={() => go("claude")}>{busy === "claude" ? <span className="spin" /> : <Icon name="ext" />}在 Claude 中分析</button>
      <button className="btn sm" disabled={Boolean(busy)} onClick={() => go("chatgpt")}>{busy === "chatgpt" ? <span className="spin" /> : <Icon name="ext" />}在 ChatGPT 中分析</button>
    </span>
  );
}
