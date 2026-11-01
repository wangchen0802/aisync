import Link from "next/link";
import { headers } from "next/headers";
import { logout } from "@/lib/actions";
import { getSetting, q, setSetting } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CaptureButton } from "@/components/capture";
import { NavLink, Toaster } from "@/components/client";
import { Icon, LogoMark } from "@/components/ui";

export const dynamic = "force-dynamic";
// "运行全部渠道" and AI classification run as server actions on these pages.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = host ? `${proto}://${host}` : "";
  const [[c], ws, saved] = await Promise.all([
    q<{ demand: number; failing: number; starred: number; themes: number; sources: number }>(
      `select
         (select count(*)::int from rd_signals where intent = 'demand' and not dismissed and relevance >= 35 and coalesce(published_at, first_seen_at) > now() - interval '7 days') as demand,
         (select count(*)::int from rd_sources where enabled and kind <> 'manual' and last_error is not null) as failing,
         (select count(*)::int from rd_signals where starred and not dismissed) as starred,
         (select count(*)::int from rd_themes where status in ('watching', 'validating', 'building')) as themes,
         (select count(*)::int from rd_sources where enabled and kind <> 'manual') as sources`,
    ),
    getSetting("workspace_name", "SimReal"),
    getSetting("base_url", ""),
  ]);
  // Remember the public URL so notifications and the bookmarklet can link back.
  if (base && !base.includes("localhost") && saved !== base) await setSetting("base_url", base);

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="ws">
          <LogoMark />
          <div><b>需求雷达</b><small>{ws} · {c.sources} 个渠道</small></div>
        </Link>
        <nav className="nav main" aria-label="主导航">
          <h6>看需求</h6>
          <NavLink href="/" icon="home" label="总览" />
          <NavLink href="/signals" icon="feed" label="信号" count={c.demand} hot />
          <NavLink href="/trends" icon="trend" label="趋势" />
          <NavLink href="/listings" icon="case" label="岗位追踪" />
          <h6>一起想</h6>
          <NavLink href="/themes" icon="bulb" label="需求假设" count={c.themes} />
          <NavLink href="/brief" icon="brief" label="周报" />
          <h6>配置</h6>
          <NavLink href="/sources" icon="plug" label="渠道" count={c.failing} />
          <NavLink href="/settings" icon="gear" label="设置" />
        </nav>
        <div className="me">
          <span className="av" style={{ background: "#6e56cf" }}>{(me.name || me.email).slice(0, 1).toUpperCase()}</span>
          <div className="who"><b>{me.name}</b><small>{me.email}</small></div>
          <form action={logout}><button className="btn ghost icon" title="退出登录" aria-label="退出登录"><Icon name="out" /></button></form>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="crumb"><b>{ws}</b> · 数据 & RL 环境需求监控</span>
          <span className="grow" />
          <Link className="btn ghost" href="/signals?starred=1"><Icon name="star" />标星 {c.starred || ""}</Link>
          <CaptureButton />
        </header>
        <main className="content">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
