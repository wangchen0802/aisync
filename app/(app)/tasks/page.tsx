import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listItems, listMembers, listProjects } from "@/lib/core";
import { progressOf } from "@/lib/meta";
import { Kanban, type TaskCardData } from "@/components/kanban";
import { NewItemButton } from "@/components/client";

export const metadata = { title: "任务进度" };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await requireUser();
  const projectId = Number((await searchParams).p) || null;
  const [items, projects, members] = await Promise.all([listItems(me.id, { projectId, limit: 500 }), listProjects(), listMembers()]);
  const tasks = items.filter((i) => i.kind === "task");
  const openDecisions = items.filter((i) => i.kind === "decision" && (i.status === "discussing" || i.status === "conflict")).map((d) => ({ id: d.id, title: d.title }));
  let done = 0, total = 0;
  for (const t of tasks) { const p = progressOf(t.status, t.subtasks); done += p.done; total += p.total; }
  const project = projects.find((p) => p.id === projectId);
  const data: TaskCardData[] = tasks.map((t) => ({
    id: t.id, title: t.title, body: t.body, status: t.status, subtasks: t.subtasks, source: t.source, due: t.due,
    assignee_id: t.assignee_id, assignee_name: t.assignee_name, owner_id: t.owner_id, project_id: t.project_id, project_name: t.project_name, project_color: t.project_color,
    last_update: t.last_update, last_update_at: t.last_update_at, blocked_by: t.blocked_by, duplicate_of: t.duplicate_of, details: { reason: t.details.reason },
  }));
  const activeMembers = members.filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <div className="ph">
        <div>
          <h1>任务进度{project ? ` · ${project.name}` : ""}</h1>
          <p>任务从 AI 对话里自动抽取，之后你在任何 AI 里继续做这件事，进度都会自动更新。{total ? `整体完成 ${Math.round((done / total) * 100)}%。` : ""}</p>
        </div>
        <NewItemButton kind="task" projects={projects} members={activeMembers} decisions={openDecisions} defaultProject={projectId} />
      </div>
      <div className="row">
        <Link className="chip" href="/tasks" style={!projectId ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}>全部项目</Link>
        {projects.map((p) => (
          <Link key={p.id} className="chip" href={`/tasks?p=${p.id}`} style={projectId === p.id ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}>
            <span className="pdot" style={{ background: p.color, marginRight: 6 }} />{p.name}
          </Link>
        ))}
      </div>
      <Kanban tasks={data} members={activeMembers} meId={me.id} isAdmin={me.role === "admin"} />
    </>
  );
}
