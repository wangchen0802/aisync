import "server-only";
import { q } from "@/lib/db";
import { minRelevance, TS } from "@/lib/trends";

export type SignalRow = {
  id: number;
  source_id: number;
  channel: string;
  url: string | null;
  title: string;
  body: string;
  author: string;
  org: string;
  org_type: string;
  location: string;
  published_at: string | null;
  first_seen_at: string;
  closed_at: string | null;
  is_listing: boolean;
  subtype: string;
  category: string;
  intent: string;
  topics: string[];
  buyers: string[];
  vendors: string[];
  relevance: number;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: string | null;
  summary: string;
  engine: string;
  engagement: number;
  starred: boolean;
  dismissed: boolean;
  note: string;
  source_name: string;
  themes: { id: number; title: string }[];
};

export type Filters = {
  q?: string;
  channel?: string;
  topic?: string;
  category?: string;
  intent?: string;
  org?: string;
  source?: number;
  starred?: boolean;
  days?: number;
  min?: number;
  listing?: "only" | "exclude" | "";
  subtype?: string;
  sort?: "new" | "relevance" | "hot";
  dismissed?: boolean;
  limit?: number;
  offset?: number;
};

export const SIGNAL_COLS = `s.id, s.source_id, s.channel, s.url, s.title, left(s.body, 700) as body, s.author, s.org, s.org_type, s.location, s.published_at,
  s.first_seen_at, s.closed_at, s.is_listing, s.subtype, s.category, s.intent, s.topics, s.buyers, s.vendors, s.relevance, s.pay_min, s.pay_max,
  s.pay_unit, s.summary, s.engine, s.engagement, s.starred, s.dismissed, s.note, src.name as source_name,
  coalesce((select json_agg(json_build_object('id', t.id, 'title', t.title)) from rd_theme_signals ts join rd_themes t on t.id = ts.theme_id where ts.signal_id = s.id), '[]'::json) as themes`;

export async function listSignals(f: Filters): Promise<{ rows: SignalRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  where.push(f.dismissed ? "s.dismissed" : "not s.dismissed");
  if (!f.starred && !f.dismissed && !f.source) where.push(`s.relevance >= ${p(f.min ?? (await minRelevance()))}`);
  if (f.q) where.push(`(s.title ilike ${p(`%${f.q}%`)} or s.body ilike $${params.length} or s.summary ilike $${params.length} or s.org ilike $${params.length} or s.author ilike $${params.length})`);
  if (f.channel) where.push(`s.channel = ${p(f.channel)}`);
  if (f.topic) where.push(`${p(f.topic)} = any(s.topics)`);
  if (f.category) where.push(`s.category = ${p(f.category)}`);
  if (f.intent) where.push(`s.intent = ${p(f.intent)}`);
  if (f.org) where.push(`(s.org = ${p(f.org)} or $${params.length} = any(s.buyers) or $${params.length} = any(s.vendors))`);
  if (f.source) where.push(`s.source_id = ${p(f.source)}`);
  if (f.starred) where.push("s.starred");
  if (f.days) where.push(`${TS} > now() - make_interval(days => ${p(f.days)})`);
  if (f.listing === "only") where.push("s.is_listing and s.closed_at is null");
  if (f.listing === "exclude") where.push("not s.is_listing");
  if (f.subtype) where.push(`s.subtype = ${p(f.subtype)}`);
  const order =
    f.sort === "relevance"
      ? `s.relevance desc, ${TS} desc`
      : f.sort === "hot"
        ? `(s.relevance + least(s.engagement, 500) / 10.0 - extract(epoch from now() - ${TS}) / 86400.0 * 4) desc`
        : `${TS} desc, s.id desc`;
  const sqlWhere = where.join(" and ");
  const [rows, [{ c }]] = await Promise.all([
    q<SignalRow>(
      `select ${SIGNAL_COLS} from rd_signals s join rd_sources src on src.id = s.source_id where ${sqlWhere}
       order by ${order} limit ${Math.min(f.limit ?? 50, 200)} offset ${Math.max(f.offset ?? 0, 0)}`,
      params,
    ),
    q<{ c: number }>(`select count(*)::int as c from rd_signals s where ${sqlWhere}`, params),
  ]);
  return { rows, total: c };
}

export async function getSignal(id: number) {
  const rows = await q<SignalRow & { full_body: string; raw: unknown }>(
    `select ${SIGNAL_COLS}, s.body as full_body, s.raw from rd_signals s join rd_sources src on src.id = s.source_id where s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export { fmtPay } from "@/lib/format";
