import Link from "next/link";
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
          <p className="ph-meta"><span>过去 24 小时</span>{slack ? <span>工作日 18:00 自动发到群</span> : <span><Link className="link" href="/settings#notify">配置群通知</Link>后自动发送</span>}</p>
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
        {!d.sections.length ? <div className="empty" style={{ padding: "12px 0" }}><p>过去 24 小时没有新进展</p></div> : null}
      </article>
    </>
  );
}
