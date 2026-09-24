import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getSetting, listGoals, listProjects } from "@/lib/core";
import { q } from "@/lib/db";
import { ensureContextKey } from "@/lib/apitoken";
import { origin } from "@/lib/origin";
import { aiEnabled } from "@/lib/ai";
import { ago, estimateTokens, todayISO, weekStart } from "@/lib/meta";
import { BriefEditor, ContextPreview, ProjectContextEditor, RotateKey } from "@/components/memory-client";
import { AskBox } from "@/components/ask-box";
import { Icon } from "@/components/ui";

export const metadata = { title: "记忆" };
export const maxDuration = 120;

export default async function Memory() {
  const me = await requireUser();
  const [brief, briefMeta, ws, projects, goals, key, base] = await Promise.all([
    getSetting("team_brief", ""), getSetting("team_brief_meta", ""), getSetting("workspace_name", "SimReal"),
    q<{ id: number; name: string; context: string; description: string }>("select id, name, context, description from projects where not archived order by created_at"),
    listGoals(me.id, weekStart(todayISO())), ensureContextKey(me.id), origin(),
  ]);
  const [counts] = await q<{ confirmed: number; open_decisions: number; tasks: number; questions: number; insights: number; convs: number; my_convs: number }>(
    `select
       count(*) filter (where kind = 'decision' and status = 'confirmed' and visibility = 'team')::int as confirmed,
       count(*) filter (where kind = 'decision' and status in ('discussing', 'conflict') and visibility = 'team')::int as open_decisions,
       count(*) filter (where kind = 'task' and status <> 'done' and visibility = 'team')::int as tasks,
       count(*) filter (where kind = 'question' and status = 'open' and visibility = 'team')::int as questions,
       count(*) filter (where kind = 'insight' and visibility = 'team')::int as insights,
       (select count(*) from conversations where status <> 'discarded')::int as convs,
       (select count(*) from conversations where user_id = $1)::int as my_convs
     from items`,
    [me.id],
  );
  const meta = (() => { try { const m = JSON.parse(briefMeta) as { by: string; at: string }; return `${m.by} ${ago(m.at)}更新`; } catch { return ""; } })();
  const link = `${base}/c/${key}`;
  const filled = projects.filter((p) => p.context.trim()).length;

  const layers = [
    { n: "1", t: "团队档案", d: "我们是谁、技术栈、术语", v: brief.trim() ? `${estimateTokens(brief)} tokens` : "未填写", how: "手写", tone: brief.trim() ? "ok" : "warn" },
    { n: "2", t: "项目背景", d: "每个项目的目标和约束", v: `${filled}/${projects.length} 已填写`, how: "手写", tone: projects.length && filled === projects.length ? "ok" : "warn" },
    { n: "3", t: "实时状态", d: `${goals.filter((g) => g.scope === "team").length} 目标 · ${counts.confirmed} 共识 · ${counts.open_decisions} 待定 · ${counts.tasks} 任务`, v: "自动", how: "实时生成", tone: "ok" },
    { n: "4", t: "对话原文", d: `${counts.convs} 段，你的 ${counts.my_convs} 段`, v: "仅作者可见", how: "不给 AI", tone: "muted" },
  ];

  return (
    <>
      <div className="ph">
        <div>
          <h1>记忆</h1>
          <p className="ph-meta"><span>所有 AI 读的都是这一份</span><span>约 {estimateTokens(brief) + 900} tokens</span></p>
        </div>
      </div>

      <section className="box">
        <div className="ctx-flow">
          <div className="ctx-layers">
            {layers.map((l) => (
              <div key={l.n} className={`ctx-layer tone-${l.tone}`}>
                <span className="ctx-n">{l.n}</span>
                <div><b>{l.t}</b><span>{l.d}</span></div>
                <div className="ctx-v"><span>{l.v}</span><small>{l.how}</small></div>
              </div>
            ))}
          </div>
          <div className="ctx-arrow" aria-hidden="true"><span>上下文<br />引擎</span><i /></div>
          <div className="ctx-out">
            {[
              ["plug", "MCP", "Claude Code、Cursor 自动读写", "/connect"],
              ["download", "浏览器插件", "ChatGPT、Claude、DeepSeek 等一键插入", "/connect"],
              ["link", "只读链接", "发给能联网的 AI", "#link"],
              ["news", ".md 文件", "上传到 Project 知识库", "#preview"],
              ["copy", "复制", "粘贴到对话开头", "#preview"],
            ].map(([ic, t, d, href]) => (
              <Link key={t} href={href} className="ctx-o"><Icon name={ic} /><div><b>{t}</b><span>{d}</span></div></Link>
            ))}
          </div>
        </div>
      </section>

      <div className="two">
        <section className="box">
          <div className="box-h"><h2><span className="ctx-n sm">1</span>团队档案</h2><span className="c">每次都读</span></div>
          <div className="pad"><BriefEditor initial={brief} meta={meta} /></div>
        </section>
        <section className="box">
          <div className="box-h"><h2><span className="ctx-n sm">2</span>项目背景</h2><span className="c">按项目读</span></div>
          <div className="pad"><ProjectContextEditor projects={projects} /></div>
        </section>
      </div>

      <section className="box" id="preview">
        <div className="box-h"><h2><Icon name="bolt" />预览</h2><span className="c">AI 实际读到的内容</span></div>
        <div className="pad"><ContextPreview projects={projects.map((p) => ({ id: p.id, name: p.name }))} link={link} workspace={ws} /></div>
      </section>

      <section className="box" id="link">
        <div className="box-h"><h2><Icon name="link" />只读链接</h2><RotateKey /></div>
        <div className="pad stack" style={{ gap: 8 }}>
          <div className="token"><span>{link}</span></div>
          <p className="muted sm" style={{ margin: 0 }}>对 AI 说「先读这个链接再回答」。只读，可加 <span className="mono">?scope=me</span> 或 <span className="mono">?topic=定价</span>。</p>
        </div>
      </section>

      <section className="box" id="ask">
        <div className="box-h"><h2><Icon name="ask" />问团队记忆</h2><span className="c">{aiEnabled() ? "带出处" : "关键词检索"}</span></div>
        <div className="pad stack" style={{ gap: 12 }}><AskBox initial="" ai={aiEnabled()} autoFocus={false} /></div>
      </section>
    </>
  );
}
