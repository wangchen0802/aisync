import { requireUser } from "@/lib/session";
import { buildDigest, DIGEST_LABEL } from "@/lib/digest";
import { sendDigest } from "@/lib/actions";
import { ActionButton } from "@/components/client";
import { Icon, Source } from "@/components/ui";
import { hasWebhook } from "@/lib/notify";

export const metadata = { title: "每日简报" };

const TONE: Record<string, string> = {
  decision: "var(--green)", done: "var(--green)", progress: "var(--accent-ink)", conflict: "var(--red)", blocked: "var(--red)", question: "var(--violet)", insight: "var(--amber)",
};

export default async function Digest() {
  await requireUser();
  const d = await buildDigest();
  const slack = await hasWebhook();
  return (
    <>
      <div className="ph">
        <div>
          <h1>每日简报</h1>
          <p>根据过去 24 小时的共识和任务进展自动生成。{slack ? "工作日 18:00（北京时间）自动推送到团队群。" : "在「设置 → 团队通知」里配置飞书 / 企业微信 / Slack 后，工作日 18:00 会自动推送到群里。"}</p>
        </div>
        {slack ? <ActionButton className="btn" action={sendDigest}><Icon name="arrow" />立即推送到群</ActionButton> : null}
      </div>
      <article className="box dg">
        <div>
          <div className="meta">
            <span>{d.date}</span>
            {d.stats.conversations ? <span>· 由 {d.stats.conversations} 段 AI 对话生成</span> : null}
            {d.sources.map((s) => <Source key={s} s={s} only />)}
          </div>
          <h2>{d.headline}</h2>
        </div>
        <div className="k">
          <div><b>{d.stats.decisions}</b><span>新共识</span></div>
          <div><b>{d.stats.progressed}</b><span>任务有进展</span></div>
          <div><b>{d.stats.done}</b><span>已完成</span></div>
          <div><b style={{ color: d.stats.conflicts ? "var(--red)" : undefined }}>{d.stats.conflicts}</b><span>冲突</span></div>
          <div><b style={{ color: d.stats.blocked ? "var(--amber)" : undefined }}>{d.stats.blocked}</b><span>阻塞</span></div>
        </div>
        {d.sections.map((s) => (
          <div className="dgs" key={s.project}>
            <h3><span className="pdot" style={{ background: s.color }} />{s.project}</h3>
            <ul>
              {s.lines.map((l, i) => (
                <li key={i}>
                  <b style={{ color: TONE[l.tone], fontWeight: 600, whiteSpace: "nowrap", fontSize: 12.5 }}>{DIGEST_LABEL[l.tone]}</b>
                  <span>{l.text}{l.who ? <span className="muted">（{l.who}）</span> : null} <span className="ref">{l.ref}</span></span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!d.sections.length ? <div className="empty" style={{ padding: "12px 0" }}><p>今天还没有新的共识或任务进展。</p></div> : null}
      </article>
    </>
  );
}
