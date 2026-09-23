"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { askTeam } from "@/lib/actions";
import { code, DECISION_STATUS, TASK_STATUS } from "@/lib/meta";
import { Icon } from "@/components/ui";

type Answer = Awaited<ReturnType<typeof askTeam>>;
const SUGGEST = ["我们最近做了哪些技术决策？", "谁在负责什么？", "还有哪些问题没定？", "有哪些任务被阻塞了？"];

function hrefOf(kind: string, id: number) {
  return `/item/${id}`;
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[DTIQ]-\d+\])/g);
  return (
    <p className="text">
      {parts.map((p, i) => {
        const m = p.match(/^\[([DTIQ])-(\d+)\]$/);
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        const kind = { D: "decision", T: "task", I: "insight", Q: "question" }[m[1]]!;
        return <Link key={i} className="ci" href={hrefOf(kind, Number(m[2]))}>{m[1]}-{m[2]}</Link>;
      })}
    </p>
  );
}

export function AskBox({ initial, ai, autoFocus = true }: { initial: string; ai: boolean; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const [asked, setAsked] = useState("");
  const [ans, setAns] = useState<Answer | null>(null);
  const [pending, start] = useTransition();
  const ran = useRef(false);
  const ask = (text: string) => {
    if (!text.trim()) return;
    setAsked(text);
    start(async () => setAns(await askTeam(text)));
  };
  useEffect(() => {
    if (initial && !ran.current) { ran.current = true; ask(initial); }
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <form className="box ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <Icon name="ask" style={{ color: "var(--accent)" }} />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="例如：我们对支付方案做过哪些决定？" aria-label="提问" />
        <button className="btn pri" disabled={pending || !q.trim()}>{pending ? <span className="spin" /> : null}提问</button>
      </form>
      <div className="chips">
        {SUGGEST.map((s) => <button key={s} className="chip" onClick={() => { setQ(s); ask(s); }}>{s}</button>)}
      </div>
      {!ai ? <div className="note">没有配置 ANTHROPIC_API_KEY，目前只返回关键词匹配的条目，不会生成总结回答。</div> : null}
      {pending ? (
        <section className="box ans"><span className="muted row"><span className="spin" />正在翻团队记忆：{asked}</span></section>
      ) : ans ? (
        <section className="box ans">
          <Rich text={ans.answer} />
          {ans.cites.length ? (
            <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              {ans.cites.map((c) => (
                <Link key={c.id} href={hrefOf(c.kind, c.id)} className="row" style={{ gap: 8, fontSize: 12.5 }}>
                  <span className="ci">{code(c.kind, c.id)}</span>
                  <span>{c.title}</span>
                  <span className={`tag s-${c.status}`}>{c.kind === "task" ? TASK_STATUS[c.status] : DECISION_STATUS[c.status] ?? (c.status === "resolved" ? "已解决" : "开放")}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
