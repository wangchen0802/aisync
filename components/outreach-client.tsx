"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  advanceContact, deleteContact, draftFollowUp, importContacts, logTouch, moveContact, previewImport, saveContact, saveRound, setInvestorAccess,
} from "@/lib/actions";
import type { Contact, Round } from "@/lib/outreach";
import {
  fmtMoney, HEAT, isLost, nextStage, pipelineOf, SOURCES_OUT, stageLabel, stagesOf, STALE_DAYS, TOUCH_KINDS, type Pipeline,
} from "@/lib/outreach-meta";
import { addDays, ago, avatarColor, todayISO } from "@/lib/meta";
import { CopyButton, Dialog, report, toast } from "@/components/client";
import { DueChip, Icon } from "@/components/ui";
import { OpenInAI } from "@/components/open-in-ai";

type Opt = { id: number; name: string };

function Av({ id, name }: { id: number | null; name: string | null }) {
  if (!id) return <span className="av" style={{ background: "var(--line-2)" }} title="未分配">?</span>;
  return <span className="av" style={{ background: avatarColor(id) }} title={name ?? ""}>{(name ?? "?").slice(0, 1).toUpperCase()}</span>;
}
export function Heat({ h }: { h: string }) {
  const x = HEAT[h] ?? HEAT.warm;
  return <span className="heat" style={{ background: x.color }} title={`热度：${x.label}`} aria-label={`热度${x.label}`} />;
}
const who = (c: Pick<Contact, "org" | "name">) => c.org || c.name;
const sub = (c: Pick<Contact, "org" | "name" | "title">) => (c.org ? [c.name, c.title].filter(Boolean).join(" · ") : c.title);
const silentDays = (c: Contact) => Math.floor((Date.now() - new Date(c.last_touch_at ?? c.created_at).getTime()) / 86400_000);
const staleOf = (c: Contact) => {
  const st = stagesOf(c.pipeline);
  const i = st.findIndex((s) => s.key === c.stage);
  return !c.next_date && i > 0 && i < st.length - 2 && silentDays(c) >= STALE_DAYS;
};

/* ───────── board + list with shared filters ───────── */

export function OutreachView({ contacts, pipeline, view, meId, currency }: { contacts: Contact[]; pipeline: Pipeline; view: "board" | "list"; meId: number; currency: string }) {
  const [filter, setFilter] = useState<"all" | "mine" | "follow">("all");
  const [query, setQuery] = useState("");
  const [showLost, setShowLost] = useState(false);
  const today = todayISO();
  const shown = useMemo(() => {
    const s = query.trim().toLowerCase();
    return contacts.filter((c) =>
      (filter !== "mine" || c.owner_id === meId) &&
      (filter !== "follow" || (c.next_date && c.next_date <= addDays(today, 2)) || staleOf(c)) &&
      (!s || `${c.org} ${c.name} ${c.title} ${c.email} ${c.notes} ${c.intro_by}`.toLowerCase().includes(s)));
  }, [contacts, filter, query, meId, today]);
  const lost = stagesOf(pipeline).at(-1)!;
  const lostCount = contacts.filter((c) => c.stage === lost.key).length;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <div className="seg" role="group" aria-label="筛选">
          {([["all", "全部"], ["mine", "我负责"], ["follow", "要跟进"]] as const).map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="ob-search"><Icon name="search" className="i sm" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索机构、人名、备注" aria-label="搜索" /></div>
        <span className="grow" />
        {lostCount ? <button className={`chip${showLost ? " chip-on" : ""}`} onClick={() => setShowLost(!showLost)}>{lost.label} {lostCount}</button> : null}
      </div>
      {view === "board"
        ? <Board contacts={shown} pipeline={pipeline} currency={currency} showLost={showLost} />
        : <Table contacts={shown.filter((c) => showLost || c.stage !== lost.key)} pipeline={pipeline} currency={currency} />}
    </div>
  );
}

function Board({ contacts, pipeline, currency, showLost }: { contacts: Contact[]; pipeline: Pipeline; currency: string; showLost: boolean }) {
  const [local, setLocal] = useState(contacts);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setLocal(contacts), [contacts]);
  const stages = stagesOf(pipeline).filter((s) => showLost || !isLost(pipeline, s.key));
  const amountLabel = pipelineOf(pipeline).amount;

  const drop = (stage: string, id: number) => {
    setOver(null);
    const c = local.find((x) => x.id === id);
    if (!c || c.stage === stage) return;
    setLocal((xs) => xs.map((x) => (x.id === id ? { ...x, stage } : x)));
    start(async () => {
      const r = await moveContact(id, stage);
      if (r.ok) toast(`${who(c)} → ${stageLabel(pipeline, stage)}`);
      else { report(r); setLocal(contacts); }
    });
  };

  return (
    <div className="kb-wrap">
      <div className="ob" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(212px, 1fr))`, minWidth: stages.length * 224 }}>
        {stages.map((s) => {
          const col = local.filter((c) => c.stage === s.key);
          const sum = col.reduce((t, c) => t + (c.amount ?? 0), 0);
          return (
            <div key={s.key} className={`kc${over === s.key ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => { e.preventDefault(); drop(s.key, Number(e.dataTransfer.getData("text/plain"))); }}>
              <div className="kc-h">
                <span>{s.label}</span><span className="n">{col.length}</span><span className="grow" />
                {amountLabel && sum ? <span className="n" title={`${amountLabel}合计`}>{fmtMoney(sum, currency)}</span> : null}
              </div>
              {col.map((c) => <Card key={c.id} c={c} currency={currency} onAdvance={() => { const n = nextStage(pipeline, c.stage); if (n) drop(n.key, c.id); }} />)}
              {!col.length ? <div className="muted" style={{ fontSize: 12, padding: "10px 6px", textAlign: "center" }}>拖到这里</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ c, currency, onAdvance }: { c: Contact; currency: string; onAdvance: () => void }) {
  const stale = staleOf(c);
  const n = nextStage(c.pipeline, c.stage);
  return (
    <article className="tk oc" draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(c.id)); e.dataTransfer.effectAllowed = "move"; (e.currentTarget as HTMLElement).classList.add("drag"); }}
      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove("drag")}>
      <div className="oc-top">
        <Heat h={c.heat} />
        <Link className="oc-org" href={`/outreach/${c.id}`} draggable={false}>{who(c)}</Link>
        {c.amount ? <span className="oc-amt">{fmtMoney(c.amount, currency)}</span> : null}
      </div>
      {sub(c) ? <div className="oc-sub">{sub(c)}</div> : null}
      {c.next_step || c.next_date ? (
        <div className="oc-next"><Icon name="arrow" className="i sm" /><span>{c.next_step || "跟进"}</span>{c.next_date ? <DueChip date={c.next_date} status="todo" /> : null}</div>
      ) : null}
      {stale ? <div className="flag amber">{silentDays(c)} 天没联系</div> : null}
      <div className="meta">
        <Av id={c.owner_id} name={c.owner_name} />
        <span className="faint" style={{ fontSize: 11.5 }}>{c.last_touch_at ? `联系于 ${ago(c.last_touch_at)}` : "未联系"}</span>
        <span className="grow" />
        {n ? <button className="btn sm advance" onClick={onAdvance}>{n.label} <Icon name="arrow" className="i sm" /></button> : null}
      </div>
    </article>
  );
}

type SortKey = "who" | "stage" | "amount" | "next" | "touch";
function Table({ contacts, pipeline, currency }: { contacts: Contact[]; pipeline: Pipeline; currency: string }) {
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(["next", 1]);
  const order = stagesOf(pipeline).map((s) => s.key);
  const rows = useMemo(() => {
    const val = (c: Contact): string | number => {
      switch (sort[0]) {
        case "who": return who(c).toLowerCase();
        case "stage": return order.indexOf(c.stage);
        case "amount": return c.amount ?? -1;
        case "next": return c.next_date ?? "9999";
        case "touch": return c.last_touch_at ?? "";
      }
    };
    return [...contacts].sort((a, b) => (val(a) < val(b) ? -sort[1] : val(a) > val(b) ? sort[1] : 0));
  }, [contacts, sort, order]);
  const amountLabel = pipelineOf(pipeline).amount;
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort[0] === k ? (sort[1] === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort([k, sort[0] === k ? (-sort[1] as 1 | -1) : 1])}>{label}{sort[0] === k ? (sort[1] === 1 ? " ↑" : " ↓") : ""}</button>
    </th>
  );
  if (!rows.length) return <div className="box empty"><p>没有符合条件的联系人</p></div>;
  return (
    <div className="box ot-wrap">
      <table className="ot">
        <thead><tr>{th("who", pipelineOf(pipeline).noun)}{th("stage", "阶段")}{amountLabel ? th("amount", amountLabel, "num") : null}<th className="hide-m">负责人</th>{th("next", "下一步")}{th("touch", "最近联系", "hide-m")}</tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><div className="ot-who"><Heat h={c.heat} /><div><Link href={`/outreach/${c.id}`}>{who(c)}</Link>{sub(c) ? <small>{sub(c)}</small> : null}</div></div></td>
              <td><span className={`stg stg-${c.stage}`}>{stageLabel(pipeline, c.stage)}</span></td>
              {amountLabel ? <td className="num mono">{c.amount ? fmtMoney(c.amount, currency) : <span className="faint">—</span>}</td> : null}
              <td className="hide-m"><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><Av id={c.owner_id} name={c.owner_name} /><span className="muted">{c.owner_name ?? "未分配"}</span></span></td>
              <td><div className="ot-next">{c.next_date ? <DueChip date={c.next_date} status="todo" /> : staleOf(c) ? <span className="due due-today">{silentDays(c)} 天没联系</span> : null}<span>{c.next_step}</span></div></td>
              <td className="hide-m muted">{c.last_touch_at ? ago(c.last_touch_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── create / edit contact ───────── */

type FormState = {
  name: string; org: string; title: string; email: string; handle: string; link: string; stage: string; heat: string; ownerId: string; roundId: string;
  amount: string; source: string; introBy: string; nextStep: string; nextDate: string; notes: string;
};
const blank = (pipeline: Pipeline, meId: number, roundId?: number | null): FormState => ({
  name: "", org: "", title: "", email: "", handle: "", link: "", stage: "target", heat: "warm", ownerId: String(meId), roundId: roundId ? String(roundId) : "",
  amount: "", source: "", introBy: "", nextStep: "", nextDate: "", notes: "",
});
/** Lossless short form for editing: 1000000 → "1M", 250000 → "250K", 1234567 → "1234567". */
const exact = (n: number | null) => (n == null ? "" : n % 1e6 === 0 && n ? `${n / 1e6}M` : n % 1e3 === 0 && n ? `${n / 1e3}K` : String(n));
const fromContact = (c: Contact): FormState => ({
  name: c.name, org: c.org, title: c.title, email: c.email, handle: c.handle, link: c.link, stage: c.stage, heat: c.heat, ownerId: c.owner_id ? String(c.owner_id) : "",
  roundId: c.round_id ? String(c.round_id) : "", amount: exact(c.amount), source: c.source, introBy: c.intro_by, nextStep: c.next_step,
  nextDate: c.next_date ?? "", notes: c.notes,
});

function Fields({ f, set, pipeline, members, rounds, full }: { f: FormState; set: (p: Partial<FormState>) => void; pipeline: Pipeline; members: Opt[]; rounds: Round[]; full?: boolean }) {
  const p = pipelineOf(pipeline);
  const inp = (k: keyof FormState, label: string, ph = "", type = "text") => (
    <label className="field"><span>{label}</span><input className="input" type={type} value={f[k]} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} /></label>
  );
  return (
    <div className="of">
      {inp("org", pipeline === "investor" ? "机构" : pipeline === "talent" ? "现公司" : "公司", pipeline === "investor" ? "例如：红杉中国" : "")}
      {inp("name", "联系人", "姓名")}
      {inp("title", "职位", pipeline === "investor" ? "Partner / VP" : "")}
      {inp("email", "邮箱", "", "email")}
      {full ? inp("handle", "其他联系方式", "微信 / 电话 / Lark") : null}
      {full ? inp("link", "链接", "LinkedIn / 官网") : null}
      {!full ? (
        <label className="field"><span>阶段</span>
          <select className="select" value={f.stage} onChange={(e) => set({ stage: e.target.value })}>{stagesOf(pipeline).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
      ) : null}
      <label className="field"><span>热度</span>
        <div className="seg">{Object.entries(HEAT).map(([k, v]) => <button type="button" key={k} aria-pressed={f.heat === k} onClick={() => set({ heat: k })}>{v.label}</button>)}</div>
      </label>
      {p.amount ? inp("amount", p.amount, "500k / 1.2M / 300万") : null}
      <label className="field"><span>负责人</span>
        <select className="select" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>
          <option value="">未分配</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      {pipeline === "investor" && rounds.length ? (
        <label className="field"><span>轮次</span>
          <select className="select" value={f.roundId} onChange={(e) => set({ roundId: e.target.value })}>
            <option value="">不限</option>{rounds.map((r) => <option key={r.id} value={r.id}>{r.name}{r.status !== "active" ? "（已结束）" : ""}</option>)}
          </select>
        </label>
      ) : null}
      <label className="field"><span>来源</span>
        <select className="select" value={f.source} onChange={(e) => set({ source: e.target.value })}>{SOURCES_OUT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      {inp("introBy", "引荐人", "谁介绍的")}
      {!full ? inp("nextStep", "下一步", "例如：发 deck") : null}
      {!full ? inp("nextDate", "跟进日期", "", "date") : null}
      <label className="field of-wide"><span>备注</span><textarea className="textarea" style={{ minHeight: full ? 90 : 60 }} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={pipeline === "investor" ? "关注点、投资偏好、组合里的相关公司" : ""} /></label>
    </div>
  );
}

const toInput = (f: FormState, pipeline: Pipeline, id?: number) => ({
  id, pipeline, name: f.name, org: f.org, title: f.title, email: f.email, handle: f.handle, link: f.link, stage: f.stage, heat: f.heat,
  ownerId: Number(f.ownerId) || null, roundId: Number(f.roundId) || null, amount: f.amount, source: f.source, introBy: f.introBy,
  nextStep: f.nextStep, nextDate: f.nextDate || null, notes: f.notes,
});

export function NewContactButton({ pipeline, members, rounds, meId, label = "添加" }: { pipeline: Pipeline; members: Opt[]; rounds: Round[]; meId: number; label?: string }) {
  const active = rounds.find((r) => r.status === "active");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => blank(pipeline, meId, active?.id));
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => setF(blank(pipeline, meId, active?.id)), [pipeline, meId, active?.id]);
  const submit = (goto: boolean) => start(async () => {
    const r = await saveContact(toInput(f, pipeline));
    report(r);
    if (r.ok) { setOpen(false); setF(blank(pipeline, meId, active?.id)); if (goto && "id" in r) router.push(`/outreach/${r.id}`); }
  });
  return (
    <>
      <button className="btn pri" onClick={() => setOpen(true)}><Icon name="plus" />{label}</button>
      {open ? (
        <Dialog title={`添加${pipelineOf(pipeline).noun}`} onClose={() => setOpen(false)} footer={<>
          <button className="btn" disabled={pending || (!f.org.trim() && !f.name.trim())} onClick={() => submit(true)}>添加并打开</button>
          <button className="btn pri" disabled={pending || (!f.org.trim() && !f.name.trim())} onClick={() => submit(false)}>{pending ? <span className="spin" /> : null}添加</button>
        </>}>
          <Fields f={f} set={(p) => setF({ ...f, ...p })} pipeline={pipeline} members={members} rounds={rounds} />
        </Dialog>
      ) : null}
    </>
  );
}

export function ContactEditor({ c, members, rounds, canDelete }: { c: Contact; members: Opt[]; rounds: Round[]; canDelete: boolean }) {
  const [f, setF] = useState(() => fromContact(c));
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => setF(fromContact(c)), [c]);
  const dirty = JSON.stringify(f) !== JSON.stringify(fromContact(c));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <Fields f={f} set={(p) => setF({ ...f, ...p })} pipeline={c.pipeline} members={members} rounds={rounds} full />
      <div className="row">
        {canDelete ? <DeleteContact id={c.id} onDone={() => router.push(`/outreach?p=${c.pipeline}`)} /> : null}
        <span className="grow" />
        {dirty ? <button className="btn sm ghost" onClick={() => setF(fromContact(c))}>撤销</button> : null}
        <button className="btn sm pri" disabled={pending || !dirty} onClick={() => start(async () => report(await saveContact(toInput(f, c.pipeline, c.id))))}>{pending ? <span className="spin" /> : null}保存</button>
      </div>
    </div>
  );
}

function DeleteContact({ id, onDone }: { id: number; onDone: () => void }) {
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  if (!ask) return <button className="btn sm ghost danger" onClick={() => setAsk(true)}><Icon name="trash" />删除</button>;
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="muted" style={{ fontSize: 12 }}>连同沟通记录一起删除</span>
      <button className="btn sm danger" disabled={pending} onClick={() => start(async () => { const r = await deleteContact(id); report(r); if (r.ok) onDone(); })}>确定</button>
      <button className="btn sm ghost" onClick={() => setAsk(false)}>取消</button>
    </span>
  );
}

/* ───────── stage stepper ───────── */

export function StageStepper({ id, pipeline, stage }: { id: number; pipeline: Pipeline; stage: string }) {
  const [cur, setCur] = useState(stage);
  const [pending, start] = useTransition();
  useEffect(() => setCur(stage), [stage]);
  const st = stagesOf(pipeline);
  const idx = st.findIndex((s) => s.key === cur);
  const lost = isLost(pipeline, cur);
  const set = (k: string) => { if (k === cur) return; const prev = cur; setCur(k); start(async () => { const r = await moveContact(id, k); if (!r.ok) { report(r); setCur(prev); } else toast(`→ ${stageLabel(pipeline, k)}`); }); };
  return (
    <div className={`stepper${lost ? " is-lost" : ""}`} aria-busy={pending}>
      {st.slice(0, -1).map((s, i) => (
        <button key={s.key} className={`stp${i < idx && !lost ? " past" : ""}${s.key === cur ? " cur" : ""}`} onClick={() => set(s.key)} aria-pressed={s.key === cur}>
          <span className="stp-d">{i < idx && !lost ? <Icon name="check" className="i sm" /> : i + 1}</span>{s.label}
        </button>
      ))}
      <button className={`stp lost${lost ? " cur" : ""}`} onClick={() => set(st.at(-1)!.key)} aria-pressed={lost}>{st.at(-1)!.label}</button>
    </div>
  );
}

/* ───────── log a touch ───────── */

export function TouchForm({ id, nextStep, nextDate, compact, onDone }: { id: number; nextStep: string; nextDate: string | null; compact?: boolean; onDone?: () => void }) {
  const [kind, setKind] = useState("email");
  const [body, setBody] = useState("");
  const [step, setStep] = useState(nextStep);
  const [date, setDate] = useState(nextDate ?? "");
  const [pending, start] = useTransition();
  useEffect(() => { setStep(nextStep); setDate(nextDate ?? ""); }, [nextStep, nextDate]);
  const today = todayISO();
  const quick: [string, string][] = [["明天", addDays(today, 1)], ["3 天后", addDays(today, 3)], ["1 周后", addDays(today, 7)], ["2 周后", addDays(today, 14)]];
  const changed = body.trim() || step !== nextStep || date !== (nextDate ?? "");
  return (
    <form className="touch-f" onSubmit={(e) => {
      e.preventDefault();
      if (!changed) return;
      start(async () => {
        const r = await logTouch(id, { kind, body, nextStep: step, nextDate: date || null });
        report(r);
        if (r.ok) { setBody(""); onDone?.(); }
      });
    }}>
      <div className="seg" role="group" aria-label="类型">{TOUCH_KINDS.map(([k, l]) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}</div>
      <textarea className="textarea" style={{ minHeight: compact ? 64 : 84 }} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={kind === "meeting" ? "聊了什么、对方的顾虑、答应了什么" : kind === "email" ? "发了什么 / 对方回复了什么" : "发生了什么"} autoFocus={compact}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
      <div className="touch-next">
        <input className="input sm grow" value={step} onChange={(e) => setStep(e.target.value)} placeholder="下一步，例如：周五前发数据室链接" aria-label="下一步" />
        <input className="input sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="跟进日期" />
      </div>
      <div className="row" style={{ gap: 6 }}>
        {quick.map(([l, d]) => <button type="button" key={l} className={`chip${date === d ? " chip-on" : ""}`} onClick={() => setDate(d)}>{l}</button>)}
        {date ? <button type="button" className="chip" onClick={() => setDate("")}>不设</button> : null}
        <span className="grow" />
        <button className="btn sm pri" disabled={pending || !changed}>{pending ? <span className="spin" /> : null}记录</button>
      </div>
    </form>
  );
}

export function LogTouchButton({ c }: { c: Pick<Contact, "id" | "org" | "name" | "next_step" | "next_date"> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>记录</button>
      {open ? (
        <Dialog title={`跟进 · ${c.org || c.name}`} onClose={() => setOpen(false)}>
          <TouchForm id={c.id} nextStep={c.next_step} nextDate={c.next_date} compact onDone={() => setOpen(false)} />
        </Dialog>
      ) : null}
    </>
  );
}

export function AdvanceButton({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  return <button className="btn sm" disabled={pending} onClick={() => start(async () => report(await advanceContact(id)))}>{label}<Icon name="arrow" className="i sm" /></button>;
}

/* ───────── round settings ───────── */

export function RoundButton({ round, access, isAdmin }: { round: Round | null; access: "all" | "admins"; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "new">(round ? "edit" : "new");
  const init = (r: Round | null) => ({ name: r?.name ?? "", target: r?.target ? String(r.target) : "", currency: r?.currency ?? "USD", instrument: r?.instrument ?? "", valuation: r?.valuation ?? "", closeDate: r?.close_date ?? "" });
  const [f, setF] = useState(() => init(round));
  const [pending, start] = useTransition();
  const openWith = (m: "edit" | "new") => { setMode(m); setF(init(m === "edit" ? round : null)); setOpen(true); };
  return (
    <>
      <button className="btn" onClick={() => openWith(round ? "edit" : "new")}>{round ? "轮次设置" : "设置本轮"}</button>
      {open ? (
        <Dialog title={mode === "new" ? "开启新一轮" : `编辑 ${round?.name}`} onClose={() => setOpen(false)} footer={<>
          {mode === "edit" ? <button className="btn ghost" style={{ marginRight: "auto" }} onClick={() => openWith("new")}>开启新一轮…</button> : null}
          <button className="btn pri" disabled={pending || !f.name.trim()} onClick={() => start(async () => {
            const r = await saveRound({ id: mode === "edit" ? round?.id : undefined, ...f, closeDate: f.closeDate || null });
            report(r); if (r.ok) setOpen(false);
          })}>{pending ? <span className="spin" /> : null}{mode === "new" ? "开启" : "保存"}</button>
        </>}>
          <div className="of">
            <label className="field"><span>轮次</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="天使轮 / Pre-A / Seed" autoFocus /></label>
            <label className="field"><span>目标金额</span>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <select className="select" style={{ width: 88 }} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}><option>USD</option><option>CNY</option><option>EUR</option></select>
                <input className="input" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} placeholder={f.currency === "CNY" ? "3000万" : "2M"} />
              </div>
            </label>
            <label className="field"><span>方式</span>
              <select className="select" value={f.instrument} onChange={(e) => setF({ ...f, instrument: e.target.value })}>
                {["", "SAFE", "股权", "可转债", "其他"].map((x) => <option key={x} value={x}>{x || "未定"}</option>)}
              </select>
            </label>
            <label className="field"><span>估值 / Cap</span><input className="input" value={f.valuation} onChange={(e) => setF({ ...f, valuation: e.target.value })} placeholder="$12M post" /></label>
            <label className="field"><span>目标关账日</span><input className="input" type="date" value={f.closeDate} onChange={(e) => setF({ ...f, closeDate: e.target.value })} /></label>
          </div>
          {mode === "new" && round ? <p className="note">当前的「{round.name}」会标记为已结束，数据保留。</p> : null}
          {isAdmin ? <AccessToggle access={access} /> : null}
        </Dialog>
      ) : null}
    </>
  );
}

function AccessToggle({ access }: { access: "all" | "admins" }) {
  const [v, setV] = useState(access);
  const [, start] = useTransition();
  return (
    <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <Icon name="lock" className="i sm" /><span style={{ fontSize: 13 }}>谁能看融资</span><span className="grow" />
      <div className="seg">
        {([["all", "全员"], ["admins", "仅管理员"]] as const).map(([k, l]) => <button key={k} aria-pressed={v === k} onClick={() => { setV(k); start(async () => report(await setInvestorAccess(k))); }}>{l}</button>)}
      </div>
    </div>
  );
}

/* ───────── CSV import ───────── */

export function ImportButton({ pipeline }: { pipeline: Pipeline }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ columns: string[]; rows: number } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!text.trim()) { setPreview(null); return; }
    const t = setTimeout(() => previewImport(text).then(setPreview), 250);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Icon name="download" style={{ transform: "rotate(180deg)" }} />导入</button>
      {open ? (
        <Dialog title={`导入${pipelineOf(pipeline).noun}`} onClose={() => setOpen(false)} footer={<>
          <span className="muted" style={{ marginRight: "auto", fontSize: 12.5 }}>{preview ? `${preview.rows} 行` : ""}</span>
          <button className="btn pri" disabled={pending || !preview?.rows} onClick={() => start(async () => { const r = await importContacts(pipeline, text); report(r); if (r.ok) { setOpen(false); setText(""); } })}>
            {pending ? <span className="spin" /> : null}导入
          </button>
        </>}>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>从表格复制粘贴，或选 CSV 文件。第一行是表头，能认出：机构、联系人、职位、邮箱、阶段、金额、负责人、备注等。重复的邮箱会跳过。</p>
          <textarea className="textarea mono" style={{ minHeight: 160, fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"机构\t联系人\t邮箱\t金额\n红杉中国\t张三\tzhang@example.com\t500k"} aria-label="表格内容" />
          <div className="row">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
            <button className="btn sm" onClick={() => fileRef.current?.click()}>选择 CSV 文件</button>
            {preview?.columns.length ? <span className="chips">{preview.columns.map((c) => <span key={c} className="chip">{c}</span>)}</span> : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

/* ───────── AI follow-up draft ───────── */

export function DraftBox({ id, email, defaultLang }: { id: number; email: string; defaultLang: "zh" | "en" }) {
  const [lang, setLang] = useState(defaultLang);
  const [text, setText] = useState("");
  const [ai, setAi] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [pending, start] = useTransition();
  const gen = () => start(async () => {
    const r = await draftFollowUp(id, lang);
    if (!r.ok) return report(r);
    setText(r.text); setAi(r.ai); setPrompt(r.prompt);
  });
  const subject = text.match(/^(?:主题|Subject)[:：]\s*(.+)$/m)?.[1] ?? "";
  const body = text.replace(/^(?:主题|Subject)[:：].*\n+/m, "");
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <div className="seg">{([["zh", "中文"], ["en", "English"]] as const).map(([k, l]) => <button key={k} aria-pressed={lang === k} onClick={() => setLang(k)}>{l}</button>)}</div>
        <span className="grow" />
        <button className="btn sm pri" disabled={pending} onClick={gen}>{pending ? <span className="spin" /> : <Icon name="ask" />}{text ? "重写" : "起草"}</button>
      </div>
      {text ? (
        <>
          <textarea className="textarea" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="草稿" />
          <div className="row">
            <span className="faint" style={{ fontSize: 11.5 }}>{ai ? "AI 根据沟通记录和团队档案起草" : "基础模板"}</span>
            <span className="grow" />
            <CopyButton text={text} label="复制" />
            {email ? <a className="btn sm" href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>用邮件打开</a> : null}
          </div>
          {!ai && prompt ? <OpenInAI prompt={prompt} label="用你的 AI 写得更好：" /> : null}
        </>
      ) : null}
    </div>
  );
}
