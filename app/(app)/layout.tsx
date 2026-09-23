import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { q } from "@/lib/db";
import { getSetting, listMembers, setSetting } from "@/lib/core";
import { origin } from "@/lib/origin";
import { MobileTop, QuickCapture, TabBar } from "@/components/shell";
import { CaptureButton } from "@/components/capture-button";
import { Avatar, Icon, LogoMark } from "@/components/ui";
import { CommandPalette, Crumb, DetailToggle, NavLink, OpenPalette, RefreshOnFocus, Toaster } from "@/components/client";
import { logout } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const [counts] = await q<{ inbox: number; attention: number; open_tasks: number; members: number; due_soon: number }>(
    `select
       (select count(*)::int from conversations where user_id = $1 and status = 'pending') as inbox,
       (select count(*)::int from items i where i.kind = 'decision' and i.visibility = 'team'
          and (i.status = 'conflict' or (i.status = 'discussing' and not exists (select 1 from acks a where a.item_id = i.id and a.user_id = $1)))) as attention,
       (select count(*)::int from items where kind = 'task' and visibility = 'team' and status <> 'done') as open_tasks,
       (select count(*)::int from users where not invited) as members,
       (select count(*)::int from items where kind = 'task' and visibility = 'team' and status <> 'done' and assignee_id = $1
          and due_date is not null and due_date <= (now() at time zone 'Asia/Shanghai')::date + 2) as due_soon`,
    [me.id],
  );
  const projects = await q<{ id: number; name: string; color: string; done: number; total: number }>(
    `select p.id, p.name, p.color,
       coalesce(sum(case when jsonb_array_length(i.subtasks) = 0 then (i.status = 'done')::int
                         else (select count(*) from jsonb_array_elements(i.subtasks) s where (s->>'done')::boolean) end), 0)::int as done,
       coalesce(sum(greatest(jsonb_array_length(i.subtasks), 1)) filter (where i.id is not null), 0)::int as total
     from projects p left join items i on i.project_id = p.id and i.kind = 'task' and i.visibility = 'team'
     where not p.archived group by p.id order by p.created_at`,
  );
  const ws = await getSetting("workspace_name", "SimReal");
  // Remember the public URL so notifications can link back into the app.
  const base = await origin();
  if (!base.includes("localhost") && (await getSetting("base_url", "")) !== base) await setSetting("base_url", base);
  const members = (await listMembers()).filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));
  const detail = (await cookies()).get("detail")?.value ?? "std";

  return (
    <div className="shell" data-detail={["lite", "std", "full"].includes(detail) ? detail : "std"}>
      <MobileTop ws={ws} me={{ id: me.id, name: me.name, image: me.image }} inbox={counts.inbox} detail={detail} />
      <aside className="side">
        <Link href="/" className="ws">
          <LogoMark />
          <div><b>{ws}</b><small>Sync · {counts.members} 位成员</small></div>
        </Link>
        <OpenPalette />
        <nav className="nav main" aria-label="主导航">
          <h6>工作区</h6>
          <NavLink href="/" icon="home" label="总览" />
          <NavLink href="/week" icon="bolt" label="本周" count={counts.due_soon} />
          <NavLink href="/tasks" icon="task" label="任务" count={counts.open_tasks} />
          <NavLink href="/consensus" icon="cons" label="共识" count={counts.attention} hot />
          <NavLink href="/ideas" icon="edit" label="想法" />
          <NavLink href="/memory" icon="ask" label="记忆" />
          <NavLink href="/inbox" icon="inbox" label="收件箱" count={counts.inbox} hot />
          <h6>更多</h6>
          <NavLink href="/activity" icon="act" label="动态" />
          <NavLink href="/digest" icon="news" label="每日简报" />
          <NavLink href="/connect" icon="plug" label="连接 AI" />
          <NavLink href="/settings" icon="gear" label="设置" />
        </nav>
        <nav className="nav projects" aria-label="项目">
          <h6>项目 <Link href="/settings#projects" title="管理项目"><Icon name="plus" className="i sm" /></Link></h6>
          {projects.length ? projects.map((p) => (
            <Link key={p.id} className="nv" href={`/tasks?p=${p.id}`}>
              <span className="pdot" style={{ background: p.color }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span className="n">{p.total ? Math.round((p.done / p.total) * 100) : 0}%</span>
            </Link>
          )) : <Link className="nv" href="/settings#projects" style={{ color: "var(--muted)" }}><Icon name="plus" />创建第一个项目</Link>}
        </nav>
        <div className="me">
          <Avatar id={me.id} name={me.name} image={me.image} />
          <div className="who"><b>{me.name}</b><small>{me.email}</small></div>
          <form action={logout}><button className="btn ghost icon" title="退出登录" aria-label="退出登录"><Icon name="out" /></button></form>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <Crumb ws={ws} />
          <span className="grow" />
          <DetailToggle initial={detail} />
          <CaptureButton />
          <Link className="btn pri" href="/import"><Icon name="plus" />导入对话</Link>
        </header>
        <main className="content">{children}</main>
      </div>
      <TabBar attention={counts.attention} dueSoon={counts.due_soon} />
      <QuickCapture projects={projects.map((p) => ({ id: p.id, name: p.name }))} members={members} />
      <CommandPalette />
      <Toaster />
      <RefreshOnFocus />
    </div>
  );
}
