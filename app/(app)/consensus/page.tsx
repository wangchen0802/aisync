import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ackThreshold, listItems, listMembers, listProjects } from "@/lib/core";
import { contextPackText } from "@/lib/context-client";
import { CopyButton, NewItemButton } from "@/components/client";
import { DecisionRow } from "@/components/items";

export const metadata = { title: "共识" };

const TABS: [string, string][] = [
  ["all", "全部决策"], ["discussing", "讨论中"], ["conflict", "有冲突"], ["confirmed", "已确认"], ["superseded", "已推翻"],
  ["question", "待定问题"], ["insight", "洞察"],
];

export default async function Consensus({ searchParams }: { searchParams: Promise<{ s?: string; p?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.s) ? sp.s! : "all";
  const projectId = Number(sp.p) || null;
  const [all, projects, members, threshold] = await Promise.all([listItems(me.id, { projectId, limit: 500 }), listProjects(), listMembers(), ackThreshold()]);
  const decisions = all.filter((i) => i.kind === "decision");
  const count = (k: string) => (k === "all" ? decisions.length : k === "question" || k === "insight" ? all.filter((i) => i.kind === k && i.status !== "resolved").length : decisions.filter((d) => d.status === k).length);
  const list =
    tab === "question" || tab === "insight" ? all.filter((i) => i.kind === tab)
    : tab === "all" ? decisions
    : decisions.filter((d) => d.status === tab);
  const order = { conflict: 0, discussing: 1, confirmed: 2, open: 2, resolved: 3, superseded: 4 } as Record<string, number>;
  list.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || (b.updated_at > a.updated_at ? 1 : -1));
  const byId = new Map(all.map((i) => [i.id, i]));
  const project = projects.find((p) => p.id === projectId);
  const qs = (s: string) => `/consensus?s=${s}${projectId ? `&p=${projectId}` : ""}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>团队共识{project ? ` · ${project.name}` : ""}</h1>
          <p>从每个人的 AI 对话里提炼出的决策。{threshold > 1 ? `${threshold} 位成员同意` : "有人同意"}后形成共识；和已有共识矛盾时会自动标出冲突。</p>
        </div>
        <div className="row">
          <CopyButton text={contextPackText(decisions)} label="复制为 AI 上下文" done="已复制已确认的共识，粘贴到任何 AI 即可" />
          <NewItemButton kind={tab === "question" ? "question" : tab === "insight" ? "insight" : "decision"} projects={projects} members={members} defaultProject={projectId} />
        </div>
      </div>
      <div className="row">
        <Link className={`chip`} href={`/consensus?s=${tab}`} style={!projectId ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}>全部项目</Link>
        {projects.map((p) => (
          <Link key={p.id} className="chip" href={`/consensus?s=${tab}&p=${p.id}`} style={projectId === p.id ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : undefined}>
            <span className="pdot" style={{ background: p.color, marginRight: 6 }} />{p.name}
          </Link>
        ))}
      </div>
      <section className="box">
        <div className="tabs" role="tablist">
          {TABS.map(([k, l]) => <Link key={k} role="tab" aria-selected={tab === k} href={qs(k)}>{l}<span className="n">{count(k)}</span></Link>)}
        </div>
        <div className="list">
          {list.map((d) => <DecisionRow key={d.id} item={d} me={me} threshold={threshold} other={d.conflict_with ? byId.get(d.conflict_with) : null} />)}
          {!list.length ? (
            <div className="empty">
              <b>{tab === "all" ? "还没有任何决策" : "这里暂时是空的"}</b>
              <p>{tab === "all" ? "从 AI 对话中导入，或者手动记录一条。之后大家的 AI 都能读到这些共识。" : "换个筛选看看。"}</p>
              {tab === "all" ? <Link className="btn" href="/import">导入对话</Link> : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
