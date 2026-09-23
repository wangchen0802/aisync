import { avatarColor, sourceOf } from "@/lib/meta";

const PATHS: Record<string, string> = {
  home: '<path d="M2.5 7 8 2.5 13.5 7v6.5h-3.5V10h-4v3.5H2.5z"/>',
  cons: '<circle cx="8" cy="8" r="5.75"/><path d="m5.5 8 1.8 1.8L10.8 6.3"/>',
  task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M6 2.5v11M10 2.5v7"/>',
  act: '<path d="M1.5 8.5h2.8l1.7-5 3.5 9 1.8-4h3.2"/>',
  inbox: '<path d="M2.5 9.5 4 3.5h8l1.5 6v3h-11z"/><path d="M2.5 9.5h3l.8 1.5h3.4l.8-1.5h3"/>',
  ask: '<path d="M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7z"/>',
  plug: '<path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0z"/><path d="M8 11.5v2"/>',
  news: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5 6h6M5 8.5h6M5 11h3.5"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/>',
  alert: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.1"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5"/>',
  chev: '<path d="m6 4 4 4-4 4"/>',
  check: '<path d="m3.5 8.5 3 3 6-7"/>',
  users: '<circle cx="6" cy="6" r="2.5"/><path d="M1.5 13c.5-2.3 2.3-3.5 4.5-3.5s4 1.2 4.5 3.5"/><path d="M10.5 3.8a2.5 2.5 0 0 1 0 4.4M12 9.8c1.3.5 2.2 1.6 2.5 3.2"/>',
  arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  clock: '<circle cx="8" cy="8" r="5.75"/><path d="M8 5v3l2 1.5"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
  x: '<path d="m4 4 8 8M12 4l-8 8"/>',
  out: '<path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10.5 11l3-3-3-3M13.5 8H6"/>',
  download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5a1 1 0 0 0 1 1h3.8a1 1 0 0 0 1-1l.6-8.5"/>',
  edit: '<path d="M10.5 2.5 13.5 5.5 6 13H3v-3z"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  link: '<path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2A3 3 0 0 0 7 13.2l.8-.8"/>',
  bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  chat: '<path d="M2.5 3.5h11v7.5H7l-3 2.5v-2.5H2.5z"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  send: '<path d="M2.5 8 13.5 2.5 11 13.5 8 9z"/><path d="m8 9 5.5-6.5"/>',
  back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  phone: '<rect x="4.5" y="1.5" width="7" height="13" rx="1.5"/><path d="M7 12.5h2"/>',
};

export function Icon({ name, className = "i", style }: { name: keyof typeof PATHS | string; className?: string; style?: React.CSSProperties }) {
  return <svg className={className} viewBox="0 0 16 16" style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }} />;
}

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, borderRadius: size * 0.27 }}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="11" height="11" rx="3" fill="var(--on-primary)" />
        <rect x="10" y="10" width="11" height="11" rx="3" stroke="var(--on-primary)" strokeWidth="2" />
      </svg>
    </span>
  );
}

export function Avatar({ id, name, image, lg }: { id?: number | null; name?: string | null; image?: string | null; lg?: boolean }) {
  const n = name || "?";
  return (
    <span className={`av${lg ? " lg" : ""}`} style={{ background: avatarColor(id) }} title={n}>
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : n.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Source({ s, only, xl }: { s: string; only?: boolean; xl?: boolean }) {
  const p = sourceOf(s);
  return (
    <span className={`pv${only ? " only" : ""}${xl ? " xl" : ""}`} title={p.name}>
      <i style={{ background: p.color }}>{p.abbr}</i>
      {only ? null : p.name}
    </span>
  );
}

export function Proj({ name, color }: { name?: string | null; color?: string | null }) {
  if (!name) return null;
  return (
    <span className="proj">
      <span className="pdot" style={{ background: color ?? "var(--faint)" }} />
      {name}
    </span>
  );
}

export function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 28;
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  );
}

export function Progress({ done, total, status }: { done: number; total: number; status: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`prog ${status === "done" ? "done" : status === "blocked" ? "blocked" : ""}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
