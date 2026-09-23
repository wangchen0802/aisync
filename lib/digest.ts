import "server-only";
import { q } from "@/lib/db";
import { getSetting } from "@/lib/core";
import { code, TASK_STATUS } from "@/lib/meta";

type Line = { tone: "decision" | "done" | "progress" | "conflict" | "blocked" | "question" | "insight"; text: string; who: string | null; ref: string };
export type Digest = {
  date: string;
  workspace: string;
  headline: string;
  stats: { decisions: number; progressed: number; done: number; conflicts: number; blocked: number; conversations: number };
  sources: string[];
  sections: { project: string; color: string; lines: Line[] }[];
};

const LABEL: Record<Line["tone"], string> = {
  decision: "共识", done: "完成", progress: "进展", conflict: "冲突", blocked: "阻塞", question: "待定", insight: "洞察",
};

export async function buildDigest(hours = 24): Promise<Digest> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const items = await q<{
    id: number; kind: string; title: string; status: string; last_update: string | null; project: string | null; color: string | null;
    who: string | null; created_at: string; updated_at: string; last_update_at: string | null; conflict_with: number | null;
  }>(
    `select i.id, i.kind, i.title, i.status, i.last_update, p.name as project, p.color, coalesce(a.name, o.name) as who,
            i.created_at, i.updated_at, i.last_update_at, i.conflict_with
     from items i left join projects p on p.id = i.project_id left join users o on o.id = i.owner_id left join users a on a.id = i.assignee_id
     where i.visibility = 'team' and i.updated_at >= $1 order by i.updated_at desc limit 200`,
    [since],
  );
  const convs = await q<{ source: string }>("select source from conversations where created_at >= $1 and status = 'published'", [since]);
  const blockedAll = await q<{ c: number }>("select count(*)::int as c from items where kind = 'task' and status = 'blocked' and visibility = 'team'");

  const sections = new Map<string, { project: string; color: string; lines: Line[] }>();
  const add = (i: (typeof items)[number], tone: Line["tone"], text: string) => {
    const key = i.project ?? "未归类";
    if (!sections.has(key)) sections.set(key, { project: key, color: i.color ?? "#A1A1AA", lines: [] });
    sections.get(key)!.lines.push({ tone, text, who: i.who, ref: code(i.kind, i.id) });
  };
  let decisions = 0, progressed = 0, done = 0, conflicts = 0;
  for (const i of items) {
    if (i.kind === "decision") {
      if (i.status === "confirmed") { decisions++; add(i, "decision", i.title); }
      else if (i.status === "conflict") { conflicts++; add(i, "conflict", `${i.title}（与 ${code("decision", i.conflict_with ?? 0)} 冲突）`); }
      else if (i.status === "discussing") add(i, "question", `待确认：${i.title}`);
    } else if (i.kind === "task") {
      if (i.status === "done") { done++; add(i, "done", i.title); }
      else if (i.status === "blocked") add(i, "blocked", `${i.title}${i.last_update ? `：${i.last_update}` : ""}`);
      else if (i.last_update_at && i.last_update_at >= since) { progressed++; add(i, "progress", `${i.title}${i.last_update ? `：${i.last_update}` : ""}（${TASK_STATUS[i.status]}）`); }
    } else if (i.kind === "question" && i.status === "open") add(i, "question", i.title);
    else if (i.kind === "insight") add(i, "insight", i.title);
  }

  const secs = [...sections.values()].map((s) => ({ ...s, lines: s.lines.slice(0, 8) }));
  const top = secs.sort((a, b) => b.lines.length - a.lines.length)[0];
  const headline = !items.length
    ? "今天团队还没有新的共识或任务进展"
    : `${decisions ? `形成 ${decisions} 项共识` : "暂无新共识"}，${done ? `完成 ${done} 个任务` : `${progressed} 个任务有进展`}${conflicts ? `，${conflicts} 处冲突待解决` : ""}${top ? `；「${top.project}」最活跃` : ""}`;

  return {
    date: new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Shanghai" }),
    workspace: await getSetting("workspace_name", "SimReal"),
    headline,
    stats: { decisions, progressed, done, conflicts, blocked: blockedAll[0]?.c ?? 0, conversations: convs.length },
    sources: [...new Set(convs.map((c) => c.source))],
    sections: secs,
  };
}

export function digestLines(d: Digest) {
  const lines: string[] = [d.headline, ""];
  for (const s of d.sections) {
    lines.push(`【${s.project}】`);
    for (const l of s.lines) lines.push(`• [${LABEL[l.tone]}] ${l.text}${l.who ? `（${l.who}）` : ""} ${l.ref}`);
    lines.push("");
  }
  return lines;
}

/** Pushes the digest to every configured channel (Slack / 飞书 / 企业微信). */
export async function pushDigest(d: Digest) {
  const { notifyStrict } = await import("@/lib/notify");
  return notifyStrict(`${d.workspace} 每日简报 · ${d.date}`, digestLines(d), "/digest");
}

export { LABEL as DIGEST_LABEL };
