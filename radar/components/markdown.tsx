import Link from "next/link";
import { Fragment } from "react";

/** Inline markdown: **bold**, `code`, [text](url), and [#123] signal references. */
function inline(text: string, key = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[#(\d+)\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<b key={k}>{m[1]}</b>);
    else if (m[2]) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3]) out.push(<Link key={k} className="ref" href={`/signals/${m[3]}`}>#{m[3]}</Link>);
    else if (m[4]) out.push(<a key={k} href={m[5]} target="_blank" rel="noreferrer">{m[4]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A deliberately small Markdown renderer for briefs (headings, lists, paragraphs). No raw HTML. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(" "), blocks.length)}</p>);
    para = [];
    if (list) {
      const items = list.items.map((it, j) => <li key={j}>{inline(it, blocks.length * 100 + j)}</li>);
      blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const Tag = h[1].length <= 2 ? "h2" : "h3";
      blocks.push(<Tag key={blocks.length}>{inline(h[2], blocks.length)}</Tag>);
    } else if (li || ol) {
      if (para.length) { const p = para; para = []; blocks.push(<p key={blocks.length}>{inline(p.join(" "), blocks.length)}</p>); }
      const ordered = Boolean(ol);
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((li ?? ol)![1]);
    } else if (!line.trim()) {
      flush();
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
