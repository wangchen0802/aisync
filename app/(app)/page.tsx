import Link from "next/link";
import { requireUser } from "@/lib/session";
import { q } from "@/lib/db";
import { ackThreshold, listItems, listMembers, listProjects } from "@/lib/core";
import { agree, resolveConflict } from "@/lib/actions";
import { ago, code, progressOf, SOURCES, sourceOf, TASK_STATUS } from "@/lib/meta";
import { ActionButton, NewItemButton } from "@/components/client";
import { DecisionRow } from "@/components/items";
import { Avatar, Icon, Proj, Progress, Source, Spark } from "@/components/ui";

export const metadata = { title: "总览" };

function greet() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Shanghai" }));
  return h < 6 ? "夜深了" : h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好";
}

export default async function Overview() {
  const me = await requireUser();
  const [items, projects, members, threshold] = await Promise.all([listItems(me.id, { limit: 500 }), listProjects(), listMembers(), ackThreshold()]);
  const decisions = items.filter((i) => i.kind === "decision");
  const tasks = items.filter((i) => i.kind === "task");

  const [daily] = await q<{ d: number[]; t: number[]; c: number[] }>(
    `with days as (select generate_series(current_date - 6, current_date, interval '1 day')::date as day)
     select array_agg((select count(*)::int from items i where i.kind = 'decision' and i.status = 'confirmed' and i.visibility = 'team' and i.updated_at::date = days.day) order by day) as d,
            array_agg((select count(*)::int from events e where e.type in ('task_progress', 'task_move') and e.created_at::date = days.day) order by day) as t,
            array_agg((select count(*)::int from conversations c where c.created_at::date = days.day) order by day) as c
     from days`,
  );
  const usage = await q<{ source: string; n: number }>(
    "select source, count(*)::int as n from conversations where created_at > now() - interval '7 days' group by source order by n desc",
  );
  const [day] = await q<{ convs: number; sources: number }>(
    "select count(*)::int as convs, count(distinct source)::int as sources from conversations where created_at > now() - interval '24 hours'",
  );
  const weekConfirmed = decisions.filter((d) => d.status === "confirmed" && d.updated_at > new Date(Date.now() - 7 * 864e5).toISOString()).length;
  const doing = tasks.filter((t) => t.status === "doing").length;
  const pending = decisions.filter((d) => d.status === "discussing" || d.status === "conflict").length;
  const blocked = tasks.filter((t) => t.status === "blocked");

  const conflicts = decisions.filter((d) => d.status === "conflict");
  const awaiting = decisions.filter((d) => d.status === "discussing" && !d.acks.some((a) => a.user_id === me.id));
  const myBlocked = blocked.filter((t) => t.assignee_id === me.id);
  const dups = tasks.filter((t) => t.duplicate_of && t.status !== "done" && (t.assignee_id === me.id || t.owner_id === me.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  const attentionCount = conflicts.length + awaiting.length + myBlocked.length + dups.length;

  const inboxCount = (await q<{ c: number }>("select count(*)::int as c from conversations where user_id = $1 and status = 'pending'", [me.id]))[0].c;
  const steps = [
    { ok: projects.length > 0, t: "创建项目", d: "把工作按项目分组，AI 会自动归类。", href: "/settings#projects", cta: "创建项目" },
    { ok: items.length > 0 || inboxCount > 0, t: "导入第一段对话", d: "粘贴任意 AI 对话，自动提炼共识和任务。", href: "/import", cta: "导入对话" },
    { ok: members.some((m) => m.id === me.id && m.last_ingest_at), t: "安装浏览器插件", d: "在 ChatGPT、Claude、DeepSeek 等页面一键同步。", href: "/connect", cta: "去安装" },
    { ok: members.length > 1, t: "邀请队友", d: "共识需要队友确认才算数。", href: "/settings#members", cta: "邀请" },
  ];
  const onboarding = steps.some((s) => !s.ok);
  const maxUsage = Math.max(1, ...usage.map((u) => u.n));

  const projRows = projects.map((p) => {
    const ts = tasks.filter((t) => t.project_id === p.id);
    let d = 0, n = 0;
    for (const t of ts) { const pr = progressOf(t.status, t.subtasks); d += pr.done; n += pr.total; }
    return { ...p, pct: n ? Math.round((d / n) * 100) : 0, done: ts.filter((t) => t.status === "done").length, total: ts.length, blocked: ts.some((t) => t.status === "blocked") };
  });

  return (
    <>
      <div className="ph">
        <div>
          <h1>{greet()}，{me.name}</h1>
          <p>
            {day.convs
              ? `过去 24 小时，团队在 ${day.sources} 个 AI 工具里同步了 ${day.convs} 段对话。`
              : "过去 24 小时还没有新的 AI 对话同步进来。"}
            {attentionCount ? ` 有 ${attentionCount} 件事需要你处理。` : ""}
          </p>
        </div>
        <div className="row">
          <NewItemButton kind="decision" label="记录决策" className="btn" projects={projects} members={members} />
          <Link className="btn" href="/digest"><Icon name="news" />今日简报</Link>
        </div>
      </div>

      {onboarding ? (
        <section className="box">
          <div className="box-h"><h2>开始使用 SimReal Sync <span className="c">{steps.filter((s) => s.ok).length}/{steps.length}</span></h2></div>
          <div className="steps">
            {steps.map((s, i) => (
              <div key={s.t} className={`step${s.ok ? " ok" : ""}`}>
                <span className="ck">{s.ok ? "✓" : i + 1}</span>
                <b>{s.t}</b>
                <p>{s.d}</p>
                {s.ok ? <span className="muted" style={{ fontSize: 12 }}>已完成</span> : <Link className="link" href={s.href}>{s.cta} <Icon name="arrow" className="i sm" /></Link>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="stats">
        <div className="box st"><span className="l"><Icon name="cons" />本周新共识</span><span className="v">{weekConfirmed}</span><Spark values={daily.d} color="var(--green)" /><span className="d">共 {decisions.filter((d) => d.status === "confirmed").length} 条已确认</span></div>
        <div className="box st"><span className="l"><Icon name="task" />进行中任务</span><span className="v">{doing}</span><Spark values={daily.t} color="var(--accent)" /><span className="d">{tasks.filter((t) => t.status === "done").length} 个已完成</span></div>
        <div className="box st"><span className="l"><Icon name="alert" />待确认 / 冲突</span><span className="v">{pending}</span><Spark values={daily.c} color="var(--amber)" /><span className="d">{conflicts.length ? <b style={{ color: "var(--red)", fontWeight: 500 }}>{conflicts.length} 处冲突</b> : `需要 ${threshold} 人确认`}</span></div>
        <div className="box st"><span className="l"><Icon name="clock" />阻塞任务</span><span className="v">{blocked.length}</span><Spark values={[0, 0, 0, 0, 0, 0, blocked.length]} color="var(--red)" /><span className="d">{blocked.length ? "依赖未确认的决策" : "没有阻塞"}</span></div>
      </div>

      <div className="ov">
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>需要你处理 <span className="c">{attentionCount}</span></h2></div>
            <div>
              {conflicts.map((d) => {
                const o = d.conflict_with ? byId.get(d.conflict_with) : null;
                return (
                  <div className="at" key={`c${d.id}`}>
                    <span className="at-ic" style={{ background: "var(--red-bg)", color: "var(--red)" }}><Icon name="alert" /></span>
                    <div className="at-b">
                      <p><b>结论冲突</b> · {d.details.reason || "两个 AI 会话得出了不同结论"}</p>
                      {o ? (
                        <div className="vs">
                          <div><span className="meta"><Avatar id={d.owner_id} name={d.owner_name} />{d.owner_name} · <Source s={d.source} /></span>{d.title}</div>
                          <div><span className="meta"><Avatar id={o.owner_id} name={o.owner_name} />{o.owner_name} · <Source s={o.source} /></span>{o.title}</div>
                        </div>
                      ) : null}
                      <div className="row">
                        <ActionButton className="btn sm pri" action={resolveConflict.bind(null, d.id, "this")}>采用新方案</ActionButton>
                        <ActionButton action={resolveConflict.bind(null, d.id, "other")}>保留原共识</ActionButton>
                        <Link className="btn sm ghost" href={`/consensus?s=conflict#${code("decision", d.id)}`}>查看细节</Link>
                      </div>
                    </div>
                  </div>
                );
              })}
              {awaiting.slice(0, 5).map((d) => (
                <div className="at" key={`a${d.id}`}>
                  <span className="at-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Icon name="cons" /></span>
                  <div className="at-b">
                    <p><b>{d.owner_name} 等你确认</b> · {d.title}</p>
                    {d.body ? <p className="muted" style={{ fontSize: 12.5 }}>{d.body}</p> : null}
                    <div className="row">
                      <ActionButton className="btn sm pri" action={agree.bind(null, d.id)}><Icon name="check" />同意</ActionButton>
                      <Link className="btn sm" href={`/consensus?s=discussing#${code("decision", d.id)}`}>查看 / 提出异议</Link>
                      <span className="meta"><Source s={d.source} /><Proj name={d.project_name} color={d.project_color} /></span>
                    </div>
                  </div>
                </div>
              ))}
              {myBlocked.map((t) => (
                <div className="at" key={`b${t.id}`}>
                  <span className="at-ic" style={{ background: "var(--red-bg)", color: "var(--red)" }}><Icon name="clock" /></span>
                  <div className="at-b">
                    <p><b>你的任务被阻塞</b> · {t.title}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>{t.blocked_by ? <>等待 <Link className="link" href={`/consensus#${code("decision", t.blocked_by)}`}>{code("decision", t.blocked_by)}</Link> 达成共识</> : t.last_update}</p>
                  </div>
                </div>
              ))}
              {dups.map((t) => (
                <div className="at" key={`d${t.id}`}>
                  <span className="at-ic" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}><Icon name="users" /></span>
                  <div className="at-b">
                    <p><b>可能在做重复工作</b> · {t.title}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      和 <Link className="link" href={`/tasks#T-${t.duplicate_of}`}>{code("task", t.duplicate_of!)}</Link>{byId.get(t.duplicate_of!) ? `（${byId.get(t.duplicate_of!)!.assignee_name ?? byId.get(t.duplicate_of!)!.owner_name}）` : ""} 相似{t.details.reason ? `：${t.details.reason}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {!attentionCount ? <div className="empty"><b>都处理完了</b><p>有需要你确认的决策、冲突或阻塞时会出现在这里。</p></div> : null}
            </div>
          </section>

          <section className="box">
            <div className="box-h"><h2>最新共识</h2><Link className="link" href="/consensus">全部 <Icon name="arrow" className="i sm" /></Link></div>
            <div className="list">
              {decisions.filter((d) => d.status !== "superseded").slice(0, 5).map((d) => <DecisionRow key={d.id} item={d} me={me} threshold={threshold} other={d.conflict_with ? byId.get(d.conflict_with) : null} />)}
              {!decisions.length ? <div className="empty"><b>还没有共识</b><p>导入一段 AI 对话，或者手动记录一条决策。</p><Link className="btn" href="/import">导入对话</Link></div> : null}
            </div>
          </section>
        </div>

        <div className="col">
          <section className="box">
            <div className="box-h"><h2>项目进度</h2><Link className="link" href="/tasks">任务看板 <Icon name="arrow" className="i sm" /></Link></div>
            {projRows.length ? projRows.map((p) => (
              <div className="pr" key={p.id}>
                <Link className="nm" href={`/tasks?p=${p.id}`}><span className="pdot" style={{ background: p.color }} />{p.name}</Link>
                <div className="bars"><Progress done={p.pct} total={100} status={p.blocked ? "blocked" : p.pct === 100 ? "done" : "doing"} /><span className="pc">{p.pct}%</span></div>
                <span className="cnt">{p.done}/{p.total} 任务{p.blocked ? <span style={{ color: "var(--red)" }}> · 阻塞</span> : null}</span>
              </div>
            )) : <div className="empty"><p>还没有项目。</p><Link className="btn sm" href="/settings#projects">创建项目</Link></div>}
          </section>

          <section className="box">
            <div className="box-h"><h2>任务动态</h2><span className="c">实时</span></div>
            <div className="list">
              {tasks.filter((t) => t.last_update_at).sort((a, b) => (b.last_update_at! > a.last_update_at! ? 1 : -1)).slice(0, 5).map((t) => {
                const pr = progressOf(t.status, t.subtasks);
                return (
                  <Link key={t.id} className="it" href={`/tasks#T-${t.id}`} style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                    <div className="meta"><Avatar id={t.assignee_id} name={t.assignee_name} /><b>{t.title}</b><span className="ref">{pr.done}/{pr.total}</span></div>
                    <div className="meta"><Source s={t.source} only /><span>{t.last_update}</span><span>· {ago(t.last_update_at)}</span><span className={`tag s-${t.status}`}>{TASK_STATUS[t.status]}</span></div>
                  </Link>
                );
              })}
              {!tasks.some((t) => t.last_update_at) ? <div className="empty"><p>任务进度会随着大家的 AI 对话自动更新。</p></div> : null}
            </div>
          </section>

          <section className="box">
            <div className="box-h"><h2>本周 AI 使用分布</h2><span className="c">只统计次数</span></div>
            <div className="dist">
              {usage.length ? usage.map((u) => (
                <div className="dr" key={u.source}><Source s={u.source} /><div className="b"><span style={{ width: `${(u.n / maxUsage) * 100}%`, background: sourceOf(u.source).color }} /></div><span className="x">{u.n}</span></div>
              )) : <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>支持 {Object.values(SOURCES).slice(0, 9).map((s) => s.name).join("、")} 等。</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
