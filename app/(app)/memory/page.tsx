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
export const maxDuration = 60;

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
    { n: "1", t: "团队档案", d: "我们是谁、在做什么、技术栈、术语", v: brief.trim() ? `约 ${estimateTokens(brief)} tokens` : "还没写", how: "手写 · 很少变", tone: brief.trim() ? "ok" : "warn" },
    { n: "2", t: "项目背景", d: "每个项目的目标、范围、约束", v: `${filled}/${projects.length} 个项目已填写`, how: "手写 · 按项目", tone: projects.length && filled === projects.length ? "ok" : "warn" },
    { n: "3", t: "实时状态", d: `${goals.filter((g) => g.scope === "team").length} 个本周目标 · ${counts.confirmed} 项共识 · ${counts.open_decisions} 项讨论中 · ${counts.tasks} 个未完成任务 · ${counts.questions} 个待定问题`, v: "自动生成", how: "每次读取时实时生成", tone: "ok" },
    { n: "4", t: "对话存档", d: `${counts.convs} 段 AI 对话（其中 ${counts.my_convs} 段是你的）`, v: "只有作者本人可见", how: "不直接给 AI，只用来提炼", tone: "muted" },
  ];

  return (
    <>
      <div className="ph">
        <div>
          <h1>记忆</h1>
          <p>团队的上下文分成四层保存。任何 AI 读取时，上下文引擎按「稳定背景 → 本周目标 → 相关内容 → 共识 → 任务与 DDL」的顺序，在长度预算内拼成一份文档，每一条都带编号，方便 AI 引用、你核对。</p>
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
              ["plug", "MCP", "Claude Code、Cursor、Claude Desktop 自动读取、查询、写回", "/connect"],
              ["download", "浏览器插件", "ChatGPT、Claude、DeepSeek、Gemini、Grok 一键插入", "/connect"],
              ["link", "只读链接", "发给能联网的 AI，它自己去读", "#link"],
              ["news", ".md 文件", "上传到 ChatGPT / Claude 的 Project 知识库", "#preview"],
              ["copy", "复制", "粘贴到任何对话开头", "#preview"],
            ].map(([ic, t, d, href]) => (
              <Link key={t} href={href} className="ctx-o"><Icon name={ic} /><div><b>{t}</b><span>{d}</span></div></Link>
            ))}
          </div>
        </div>
      </section>

      <div className="two">
        <section className="box">
          <div className="box-h"><h2><span className="ctx-n sm">1</span>团队档案</h2><span className="c">所有 AI 都会先读</span></div>
          <div className="pad"><BriefEditor initial={brief} meta={meta} /></div>
        </section>
        <section className="box">
          <div className="box-h"><h2><span className="ctx-n sm">2</span>项目背景</h2><span className="c">读取某个项目时加入</span></div>
          <div className="pad"><ProjectContextEditor projects={projects} /></div>
        </section>
      </div>

      <section className="box" id="preview">
        <div className="box-h"><h2><Icon name="bolt" />AI 实际读到的内容</h2><span className="c">实时生成</span></div>
        <div className="pad"><ContextPreview projects={projects.map((p) => ({ id: p.id, name: p.name }))} link={link} workspace={ws} /></div>
      </section>

      <section className="box" id="link">
        <div className="box-h"><h2><Icon name="link" />只读链接</h2><RotateKey /></div>
        <div className="pad stack" style={{ gap: 8 }}>
          <div className="token"><span>{link}</span></div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            对能联网的 ChatGPT、Claude、Gemini 说「先读这个链接再回答」。链接只能读取、不能写入，范围是你能看到的团队内容；可加参数 <span className="mono">?scope=me</span>、<span className="mono">?topic=定价</span>。泄露了就点「重置链接」。
          </p>
        </div>
      </section>

      <section className="box" id="ask">
        <div className="box-h"><h2><Icon name="ask" />问团队记忆</h2><span className="c">{aiEnabled() ? "Claude 回答并标出处" : "关键词检索"}</span></div>
        <div className="pad stack" style={{ gap: 12 }}><AskBox initial="" ai={aiEnabled()} autoFocus={false} /></div>
      </section>
    </>
  );
}
