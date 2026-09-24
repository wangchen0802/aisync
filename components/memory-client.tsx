"use client";

import { useEffect, useState, useTransition } from "react";
import { previewContext, rotateContextKey, saveProjectContext, saveTeamBrief } from "@/lib/actions";
import { estimateTokens } from "@/lib/meta";
import { CopyButton, report, toast } from "@/components/client";
import { Icon } from "@/components/ui";

const BRIEF_TEMPLATE = `## 我们是谁
SimReal：一句话说明公司在做什么、给谁用。

## 当前阶段与重点
- 阶段：例如 MVP 内测 / 找 PMF
- 本季度最重要的 1–3 件事：

## 产品与技术
- 产品形态：
- 技术栈：
- 关键约束（预算、合规、时间）：

## 用户与市场
- 目标用户：
- 主要竞品与差异：

## 术语表
- 术语：解释

## 工作方式
- 决策方式、沟通渠道（Lark 群）、代码规范等`;

export function BriefEditor({ initial, meta }: { initial: string; meta: string }) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = text !== initial;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <textarea className="textarea brief" value={text} onChange={(e) => setText(e.target.value)} aria-label="团队档案"
        placeholder="我们是谁、在做什么、技术栈、术语" />
      <div className="row">
        <span className="muted" style={{ fontSize: 12 }}>约 {estimateTokens(text)} tokens{meta ? ` · ${meta}` : ""}</span>
        <span className="grow" />
        {!text.trim() ? <button className="btn sm ghost" onClick={() => setText(BRIEF_TEMPLATE)}>用模板开始</button> : null}
        <button className="btn sm pri" disabled={pending || !dirty} onClick={() => start(async () => report(await saveTeamBrief(text)))}>{pending ? <span className="spin" /> : null}保存</button>
      </div>
    </div>
  );
}

export function ProjectContextEditor({ projects }: { projects: { id: number; name: string; context: string; description: string }[] }) {
  const [pid, setPid] = useState(projects[0]?.id ?? 0);
  const current = projects.find((p) => p.id === pid);
  const [text, setText] = useState(current?.context ?? "");
  const [pending, start] = useTransition();
  useEffect(() => setText(projects.find((p) => p.id === pid)?.context ?? ""), [pid, projects]);
  if (!projects.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>暂无项目</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row src-pick" style={{ gap: 6 }}>
        {projects.map((p) => <button key={p.id} className={`chip${p.id === pid ? " chip-on" : ""}`} onClick={() => setPid(p.id)}>{p.name}{p.context ? "" : " ·"}</button>)}
      </div>
      <textarea className="textarea brief" style={{ minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="项目背景"
        placeholder="目标、范围、约束、链接" />
      <div className="row">
        <span className="muted" style={{ fontSize: 12 }}>约 {estimateTokens(text)} tokens</span>
        <span className="grow" />
        <button className="btn sm pri" disabled={pending || text === (current?.context ?? "")} onClick={() => start(async () => report(await saveProjectContext(pid, text)))}>保存</button>
      </div>
    </div>
  );
}

type Built = Awaited<ReturnType<typeof previewContext>>;

export function ContextPreview({ projects, link, workspace }: { projects: { id: number; name: string }[]; link: string; workspace: string }) {
  const [scope, setScope] = useState<"team" | "project" | "me">("team");
  const [project, setProject] = useState(projects[0]?.id ?? 0);
  const [topic, setTopic] = useState("");
  const [budget, setBudget] = useState(6000);
  const [data, setData] = useState<Built | null>(null);
  const [pending, start] = useTransition();
  const load = () => start(async () => setData(await previewContext({ scope, projectId: project, topic: topic.trim() || undefined, budget })));
  useEffect(load, [scope, project, budget]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = new URLSearchParams();
  if (scope !== "team") params.set("scope", scope);
  if (scope === "project" && project) params.set("project", String(project));
  if (topic.trim()) params.set("topic", topic.trim());
  if (budget !== 8000) params.set("budget", String(budget));
  const fullLink = `${link}${params.toString() ? `?${params}` : ""}`;

  const download = () => {
    if (!data) return;
    const blob = new Blob([data.text], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workspace}-context-${data.asOf}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("已下载");
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <div className="seg" role="group" aria-label="范围">
          {([["team", "整个团队"], ["project", "某个项目"], ["me", "我的工作"]] as const).map(([k, l]) => <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>)}
        </div>
        {scope === "project" ? (
          <select className="select sm" value={project} onChange={(e) => setProject(Number(e.target.value))} aria-label="项目">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
        <div className="seg" role="group" aria-label="长度">
          {[[2000, "精简"], [6000, "标准"], [12000, "完整"]].map(([b, l]) => <button key={b} aria-pressed={budget === b} onClick={() => setBudget(b as number)}>{l}</button>)}
        </div>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="input sm grow" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="话题（可选），如：定价" aria-label="话题" />
        <button className="btn sm">预览</button>
      </form>
      {data ? (
        <>
          <div className="ctx-meter">
            <div className="prog"><span style={{ width: `${Math.min(100, (data.tokens / budget) * 100)}%` }} /></div>
            <span className="mono">{data.tokens.toLocaleString()} / {budget.toLocaleString()} tokens</span>
          </div>
          <div className="chips">
            {data.sections.map((s) => <span key={s.name} className="chip" title={s.shown < s.total ? "超出长度的部分 AI 可以用 search_team_memory 查询" : ""}>{s.name} <b className="mono" style={{ fontWeight: 500 }}>{s.shown}{s.shown < s.total ? `/${s.total}` : ""}</b></span>)}
          </div>
          <pre className="code ctx-pre" aria-busy={pending}>{data.text}</pre>
          <div className="row">
            <CopyButton className="btn sm pri" text={data.text} label="复制" done="已复制" />
            <button className="btn sm" onClick={download}><Icon name="download" />下载 .md</button>
            <CopyButton className="btn sm" text={`先阅读这个链接里的团队上下文，再回答我接下来的问题：${fullLink}`} label="复制链接" done="已复制" />
          </div>
        </>
      ) : <div className="muted row"><span className="spin" />正在生成…</div>}
    </div>
  );
}

export function RotateKey() {
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  if (ask)
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>旧链接会立刻失效</span>
        <button className="btn sm danger" disabled={pending} onClick={() => start(async () => { report(await rotateContextKey()); setAsk(false); })}>确定</button>
        <button className="btn sm ghost" onClick={() => setAsk(false)}>取消</button>
      </span>
    );
  return <button className="btn sm ghost" onClick={() => setAsk(true)}>重置链接</button>;
}
