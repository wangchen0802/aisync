import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listMembers } from "@/lib/core";
import { activeRound, getContact, listRounds, listTouches } from "@/lib/outreach";
import { fmtMoney, pipelineOf, SOURCES_OUT, touchLabel } from "@/lib/outreach-meta";
import { ago } from "@/lib/meta";
import { ContactEditor, DraftBox, Heat, StageStepper, TouchForm } from "@/components/outreach-client";
import { CopyButton } from "@/components/client";
import { Avatar, Icon } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const c = await getContact(me, Number((await params).id));
  return { title: c ? c.org || c.name : "联系人" };
}

const KIND_ICON: Record<string, string> = { email: "send", meeting: "users", call: "phone", message: "chat", note: "edit", stage: "arrow" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await getContact(me, id) : null;
  if (!c) notFound();
  const [touches, rounds, members, round] = await Promise.all([listTouches(c.id), listRounds(), listMembers(), c.pipeline === "investor" ? activeRound() : null]);
  const p = pipelineOf(c.pipeline);
  const team = members.filter((m) => !m.invited || m.id === me.id).map((m) => ({ id: m.id, name: m.name }));
  const cur = rounds.find((r) => r.id === c.round_id)?.currency ?? round?.currency ?? "USD";
  const latin = /^[\x00-\x7F\s]+$/.test(`${c.name}${c.org}`);
  const source = SOURCES_OUT.find(([k]) => k === c.source)?.[1];

  return (
    <>
      <Link className="back-link" href={`/outreach?p=${c.pipeline}`}><Icon name="back" className="i sm" />{c.pipeline === "investor" ? "融资" : `外联 · ${p.label}`}</Link>
      <div className="ph">
        <div style={{ minWidth: 0 }}>
          <h1 className="row" style={{ gap: 10 }}><Heat h={c.heat} />{c.org || c.name}</h1>
          <p className="ph-meta">
            {c.org && c.name ? <span>{c.name}{c.title ? ` · ${c.title}` : ""}</span> : c.title ? <span>{c.title}</span> : null}
            {c.amount ? <span className="mono">{fmtMoney(c.amount, cur)}</span> : null}
            {c.owner_name ? <span>负责 {c.owner_name}</span> : null}
            {source && c.source ? <span>{source}{c.intro_by ? `（${c.intro_by}）` : ""}</span> : c.intro_by ? <span>引荐 {c.intro_by}</span> : null}
            <span>{c.last_touch_at ? `联系于 ${ago(c.last_touch_at)}` : "还没联系"}</span>
          </p>
        </div>
        <div className="row">
          {c.email ? <CopyButton text={c.email} label={c.email} className="btn sm" done="邮箱已复制" /> : null}
          {c.link ? <a className="btn sm" href={/^https?:\/\//.test(c.link) ? c.link : `https://${c.link}`} target="_blank" rel="noopener noreferrer"><Icon name="link" />链接</a> : null}
        </div>
      </div>

      <StageStepper id={c.id} pipeline={c.pipeline} stage={c.stage} />

      <div className="ov">
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>记录跟进</h2>{c.next_step || c.next_date ? <span className="muted" style={{ fontSize: 12 }}>下一步已设置，可以直接改</span> : null}</div>
            <div className="pad"><TouchForm id={c.id} nextStep={c.next_step} nextDate={c.next_date} /></div>
          </section>
          <section className="box">
            <div className="box-h"><h2>沟通记录 <span className="c">{touches.filter((t) => t.kind !== "stage").length}</span></h2></div>
            {touches.length ? (
              <ol className="tl-touch">
                {touches.map((t) => (
                  <li key={t.id} className={t.kind === "stage" ? "is-stage" : ""}>
                    <span className="tt-ic"><Icon name={KIND_ICON[t.kind] ?? "edit"} className="i sm" /></span>
                    <div className="tt-b">
                      <div className="tt-h"><Avatar id={t.user_id} name={t.user_name} /><b>{t.user_name ?? "—"}</b><span className="muted">{touchLabel(t.kind)}</span><span className="grow" /><time className="muted" dateTime={t.created_at} title={t.created_at.slice(0, 16).replace("T", " ")}>{ago(t.created_at)}</time></div>
                      {t.body ? <p>{t.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <div className="empty sm-empty"><p>还没有记录。每次邮件、会议、电话后记一笔。</p></div>}
          </section>
        </div>
        <div className="col">
          <section className="box">
            <div className="box-h"><h2>写跟进邮件</h2></div>
            <div className="pad"><DraftBox id={c.id} email={c.email} defaultLang={latin ? "en" : "zh"} /></div>
          </section>
          <section className="box">
            <div className="box-h"><h2>资料</h2><span className="muted" style={{ fontSize: 12 }}>创建于 {c.created_at.slice(0, 10)}</span></div>
            <div className="pad"><ContactEditor c={c} members={team} rounds={rounds} canDelete={me.role === "admin" || !c.owner_id || c.owner_id === me.id} /></div>
          </section>
        </div>
      </div>
    </>
  );
}
