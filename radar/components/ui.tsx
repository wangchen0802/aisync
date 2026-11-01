import Link from "next/link";
import { fmtPay } from "@/lib/format";
import { CHANNEL_META, INTENT_HELP, INTENT_LABEL } from "@/lib/taxonomy";

const PATHS: Record<string, string> = {
  home: '<path d="M2.5 7 8 2.5 13.5 7v6.5h-3.5V10h-4v3.5H2.5z"/>',
  feed: '<path d="M3 3.5h10M3 8h10M3 12.5h6"/>',
  trend: '<path d="M2 12 6 8l3 3 5-6"/><path d="M10.5 5H14v3.5"/>',
  brief: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  case: '<rect x="2.5" y="5" width="11" height="8" rx="1.5"/><path d="M6 5V3.5h4V5M2.5 8.5h11"/>',
  bulb: '<path d="M6 12h4M6.5 14h3M5 9.5a4 4 0 1 1 6 0c-.6.6-1 1.2-1 2H6c0-.8-.4-1.4-1-2z"/>',
  plug: '<path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0z"/><path d="M8 11.5v2"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/>',
  alert: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.1"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5"/>',
  chev: '<path d="m6 4 4 4-4 4"/>',
  check: '<path d="m3.5 8.5 3 3 6-7"/>',
  arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  ext: '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
  x: '<path d="m4 4 8 8M12 4l-8 8"/>',
  out: '<path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10.5 11l3-3-3-3M13.5 8H6"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5a1 1 0 0 0 1 1h3.8a1 1 0 0 0 1-1l.6-8.5"/>',
  edit: '<path d="M10.5 2.5 13.5 5.5 6 13H3v-3z"/>',
  star: '<path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>',
  eyeoff: '<path d="M2.5 2.5l11 11M6.6 6.6a2 2 0 0 0 2.8 2.8M4.3 4.4C3 5.3 2 6.6 1.5 8c1.2 3 3.8 4.5 6.5 4.5 1.2 0 2.3-.3 3.3-.8M7 3.6c.3 0 .7-.1 1-.1 2.7 0 5.3 1.5 6.5 4.5-.3.8-.8 1.6-1.4 2.3"/>',
  play: '<path d="M5 3.5v9l7-4.5z"/>',
  bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  link: '<path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2A3 3 0 0 0 7 13.2l.8-.8"/>',
  send: '<path d="M2.5 8 13.5 2.5 11 13.5 8 9z"/><path d="m8 9 5.5-6.5"/>',
  back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  layers: '<path d="m8 2.5 6 3-6 3-6-3z"/><path d="m2 8.5 6 3 6-3M2 11l6 3 6-3"/>',
  download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  note: '<path d="M3 2.5h10v8l-3 3H3z"/><path d="M10 13.5v-3h3"/>',
};

export function Icon({ name, className = "i", style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <svg className={className} viewBox="0 0 16 16" style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }} />;
}

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <span className="logo radar" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="var(--on-primary)" strokeWidth="1.8" opacity="0.45" />
        <circle cx="12" cy="12" r="4" stroke="var(--on-primary)" strokeWidth="1.8" opacity="0.8" />
        <path d="M12 12 18.5 6.5" stroke="var(--on-primary)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function ChannelBadge({ channel, label }: { channel: string; label?: string }) {
  const m = CHANNEL_META[channel] ?? { label: channel, abbr: channel.slice(0, 2).toUpperCase(), color: "#71717a" };
  return (
    <span className="ch" title={m.label}>
      <i style={{ background: m.color }}>{m.abbr}</i>
      {label ?? m.label}
    </span>
  );
}

export function Intent({ intent }: { intent: string }) {
  return <span className={`int int-${intent}`} title={INTENT_HELP[intent]}>{INTENT_LABEL[intent] ?? intent}</span>;
}

export function Pay({ min, max, unit }: { min: number | null; max: number | null; unit: string | null }) {
  const t = fmtPay(min, max, unit);
  return t ? <span className="pay" title="从岗位描述中识别的薪资">{t}</span> : null;
}

export function Relevance({ value }: { value: number }) {
  return (
    <span className="rel" title={`相关度 ${value}/100`}>
      <b><span style={{ width: `${Math.max(4, value)}%` }} /></b>
      {value}
    </span>
  );
}

export type TopicMeta = Record<string, { key: string; label: string; grp: string }>;

export function TopicChips({ keys, meta, link = true, max = 6 }: { keys: string[]; meta: TopicMeta; link?: boolean; max?: number }) {
  return (
    <>
      {keys.slice(0, max).map((k) => {
        const t = meta[k];
        if (!t) return null;
        const cls = `tp${t.grp === "format" ? " fmt" : ""}`;
        return link ? <Link key={k} className={cls} href={`/signals?topic=${k}`}>{t.label}</Link> : <span key={k} className={cls}>{t.label}</span>;
      })}
    </>
  );
}

/** Single-series sparkline: 2px line, ~10% wash, end dot with a surface ring. Hover shows the last value. */
export function Spark({ values, label }: { values: number[]; label?: string }) {
  const w = 120, h = 28;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, h - 4 - (v / max) * (h - 9)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <span data-tip={label ?? `最近 7 天 ${values[values.length - 1]}`} style={{ display: "block" }}>
      <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label ?? `近 ${values.length} 周：${values.join("、")}`}>
        <path d={`${d} L${w} ${h} L0 ${h}Z`} fill="var(--viz-1)" opacity={0.1} />
        <path d={d} fill="none" stroke="var(--viz-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={last[0]} cy={last[1]} r={3.2} fill="var(--viz-1)" stroke="var(--panel)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

/** Horizontal magnitude bars with an optional tick for the previous period. */
export function HBars({ rows, unit = "", prevLabel }: { rows: { name: string; value: number; prev?: number; href?: string; tip?: string }[]; unit?: string; prevLabel?: string }) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.prev ?? 0)), 1);
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hb" key={r.name}>
          <span className="n">{r.href ? <Link href={r.href}>{r.name}</Link> : r.name}</span>
          <span className="tr" data-tip={r.tip ?? `${r.name}：${r.value}${unit}${r.prev !== undefined ? `\n${prevLabel ?? "上一期"}：${r.prev}${unit}` : ""}`} tabIndex={0}>
            <span style={{ width: `${(r.value / max) * 100}%` }} />
            {r.prev !== undefined && r.prev > 0 ? <em style={{ left: `calc(${(r.prev / max) * 100}% - 1px)` }} /> : null}
          </span>
          <span className="x">{r.value}{unit}</span>
        </div>
      ))}
    </div>
  );
}

export function Delta({ now, base }: { now: number; base: number }) {
  const d = now - base;
  if (Math.abs(d) < 0.5) return <span className="dl">持平</span>;
  return <span className="dl">{d > 0 ? "↑" : "↓"} {Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}</span>;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
