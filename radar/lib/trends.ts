import "server-only";
import { getSetting, q } from "@/lib/db";

export const TS = "coalesce(s.published_at, s.first_seen_at)";
export const WEEKS = 12;

export async function minRelevance(): Promise<number> {
  const v = Number(await getSetting("min_relevance", "35"));
  return Number.isFinite(v) ? v : 35;
}

export type TopicTrend = {
  key: string;
  label: string;
  grp: string;
  color: string;
  series: number[]; // oldest → newest, one value per 7-day window
  now: number; // last 7 days
  base: number; // avg of the previous 4 windows
  delta: number;
  score: number; // rise relative to its own baseline
  total: number;
};

/** Weekly counts per topic over the last 12 weeks (7-day windows ending now). */
export async function topicTrends(min?: number): Promise<TopicTrend[]> {
  const rel = min ?? (await minRelevance());
  const [rows, topics] = await Promise.all([
    q<{ t: string; wk: number; c: number }>(
      `select t, floor(extract(epoch from (now() - ${TS})) / 604800)::int as wk, count(*)::int as c
       from rd_signals s, unnest(s.topics) t
       where not s.dismissed and s.relevance >= $1 and ${TS} > now() - interval '${WEEKS * 7} days'
       group by 1, 2`,
      [rel],
    ),
    q<{ key: string; label: string; grp: string; color: string }>("select key, label, grp, color from rd_topics where not archived order by sort"),
  ]);
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.wk < 0 || r.wk >= WEEKS) continue;
    const arr = by.get(r.t) ?? Array(WEEKS).fill(0);
    arr[WEEKS - 1 - r.wk] += r.c;
    by.set(r.t, arr);
  }
  return topics.map((t) => {
    const series = by.get(t.key) ?? Array(WEEKS).fill(0);
    const now = series[WEEKS - 1];
    const prev = series.slice(WEEKS - 5, WEEKS - 1);
    const base = prev.reduce((a, b) => a + b, 0) / prev.length;
    return { ...t, series, now, base, delta: now - base, score: (now - base) / Math.sqrt(base + 1), total: series.reduce((a, b) => a + b, 0) };
  });
}

export type Overview = {
  newSignals: number;
  newSignalsPrev: number;
  demand: number;
  demandPrev: number;
  openListings: number;
  openExpert: number;
  opened: number;
  closed: number;
  medianHourly: number | null;
  weekly: number[];
  sources: number;
  failing: number;
  unclassified: number;
};

export async function overview(): Promise<Overview> {
  const rel = await minRelevance();
  const [k] = await q<Omit<Overview, "weekly">>(
    `select
       (select count(*)::int from rd_signals s where not dismissed and relevance >= $1 and first_seen_at > now() - interval '7 days' and ${TS} > now() - interval '14 days') as "newSignals",
       (select count(*)::int from rd_signals s where not dismissed and relevance >= $1 and first_seen_at between now() - interval '14 days' and now() - interval '7 days' and ${TS} > now() - interval '21 days') as "newSignalsPrev",
       (select count(*)::int from rd_signals s where not dismissed and intent = 'demand' and relevance >= $1 and ${TS} > now() - interval '7 days') as demand,
       (select count(*)::int from rd_signals s where not dismissed and intent = 'demand' and relevance >= $1 and ${TS} between now() - interval '14 days' and now() - interval '7 days') as "demandPrev",
       (select count(*)::int from rd_signals where is_listing and closed_at is null) as "openListings",
       (select count(*)::int from rd_signals where is_listing and closed_at is null and subtype = 'expert') as "openExpert",
       (select count(*)::int from rd_changes where type = 'opened' and created_at > now() - interval '7 days') as opened,
       (select count(*)::int from rd_changes where type = 'closed' and created_at > now() - interval '7 days') as closed,
       (select percentile_cont(0.5) within group (order by (pay_min + coalesce(pay_max, pay_min)) / 2)
          from rd_signals where is_listing and closed_at is null and pay_unit = 'hr') as "medianHourly",
       (select count(*)::int from rd_sources where enabled and kind <> 'manual') as sources,
       (select count(*)::int from rd_sources where enabled and kind <> 'manual' and last_error is not null) as failing,
       (select count(*)::int from rd_signals where engine = 'rules' and relevance >= $1 and first_seen_at > now() - interval '14 days') as unclassified`,
    [rel],
  );
  const weeks = await q<{ wk: number; c: number }>(
    `select floor(extract(epoch from (now() - ${TS})) / 604800)::int as wk, count(*)::int as c
     from rd_signals s where not dismissed and relevance >= $1 and ${TS} > now() - interval '${WEEKS * 7} days' group by 1`,
    [rel],
  );
  const weekly = Array(WEEKS).fill(0);
  for (const w of weeks) if (w.wk >= 0 && w.wk < WEEKS) weekly[WEEKS - 1 - w.wk] = w.c;
  return { ...k, medianHourly: k.medianHourly == null ? null : Math.round(Number(k.medianHourly)), weekly };
}

export type OrgCount = { name: string; now: number; prev: number };

/** Labs mentioned outside their own job boards (what others say they are buying / building). */
export async function buyerMentions(days = 30): Promise<OrgCount[]> {
  const rel = await minRelevance();
  return q<OrgCount>(
    `select b as name,
       count(*) filter (where ${TS} > now() - make_interval(days => $2))::int as now,
       count(*) filter (where ${TS} <= now() - make_interval(days => $2))::int as prev
     from rd_signals s, unnest(s.buyers) b
     where not s.dismissed and s.relevance >= $1 and not (s.is_listing and s.org_type = 'lab')
       and ${TS} > now() - make_interval(days => $2 * 2)
     group by 1 having count(*) filter (where ${TS} > now() - make_interval(days => $2)) > 0
     order by 2 desc, 1 limit 16`,
    [rel, days],
  );
}

export async function vendorMentions(days = 30): Promise<OrgCount[]> {
  const rel = await minRelevance();
  return q<OrgCount>(
    `select v as name,
       count(*) filter (where ${TS} > now() - make_interval(days => $2))::int as now,
       count(*) filter (where ${TS} <= now() - make_interval(days => $2))::int as prev
     from rd_signals s, unnest(s.vendors) v
     where not s.dismissed and s.relevance >= $1 and not s.is_listing and ${TS} > now() - make_interval(days => $2 * 2)
     group by 1 having count(*) filter (where ${TS} > now() - make_interval(days => $2)) > 0
     order by 2 desc, 1 limit 16`,
    [rel, days],
  );
}

export type Board = {
  source_id: number;
  org: string;
  org_type: string;
  name: string;
  open: number;
  expert: number;
  opened7: number;
  closed7: number;
  opened30: number;
  median_hr: number | null;
  max_hr: number | null;
  last_ok_at: string | null;
  last_error: string | null;
};

export async function boards(): Promise<Board[]> {
  return q<Board>(
    `select src.id as source_id, coalesce(nullif(src.config->>'org', ''), src.name) as org, coalesce(src.config->>'org_type', '') as org_type, src.name,
       count(s.id) filter (where s.closed_at is null)::int as open,
       count(s.id) filter (where s.closed_at is null and s.subtype = 'expert')::int as expert,
       (select count(*)::int from rd_changes c where c.source_id = src.id and c.type = 'opened' and c.created_at > now() - interval '7 days') as opened7,
       (select count(*)::int from rd_changes c where c.source_id = src.id and c.type = 'closed' and c.created_at > now() - interval '7 days') as closed7,
       (select count(*)::int from rd_changes c where c.source_id = src.id and c.type = 'opened' and c.created_at > now() - interval '30 days') as opened30,
       round(percentile_cont(0.5) within group (order by (s.pay_min + coalesce(s.pay_max, s.pay_min)) / 2) filter (where s.closed_at is null and s.pay_unit = 'hr'))::int as median_hr,
       max(coalesce(s.pay_max, s.pay_min)) filter (where s.closed_at is null and s.pay_unit = 'hr')::int as max_hr,
       src.last_ok_at, src.last_error
     from rd_sources src left join rd_signals s on s.source_id = src.id and s.is_listing
     where src.kind in ('greenhouse', 'lever', 'ashby')
     group by src.id order by open desc, src.name`,
  );
}

export type PayRow = { key: string; label: string; color: string; n: number; p25: number; p50: number; p75: number; max: number };

/** Hourly pay for open expert listings, by topic — what each kind of expertise is worth right now. */
export async function payByTopic(): Promise<PayRow[]> {
  return q<PayRow>(
    `with x as (
       select t, (s.pay_min + coalesce(s.pay_max, s.pay_min)) / 2 as mid, coalesce(s.pay_max, s.pay_min) as top
       from rd_signals s, unnest(s.topics) t
       where s.is_listing and s.closed_at is null and s.pay_unit = 'hr'
     )
     select x.t as key, tp.label, tp.color, count(*)::int as n,
       round(percentile_cont(0.25) within group (order by mid))::int as p25,
       round(percentile_cont(0.5) within group (order by mid))::int as p50,
       round(percentile_cont(0.75) within group (order by mid))::int as p75,
       round(max(top))::int as max
     from x join rd_topics tp on tp.key = x.t
     group by x.t, tp.label, tp.color, tp.sort having count(*) >= 2
     order by p50 desc`,
  );
}

export async function channelMix(days = 7) {
  const rel = await minRelevance();
  return q<{ channel: string; c: number }>(
    `select channel, count(*)::int as c from rd_signals s where not dismissed and relevance >= $1 and ${TS} > now() - make_interval(days => $2) group by 1 order by 2 desc`,
    [rel, days],
  );
}

export type Change = {
  id: number;
  type: string;
  detail: string;
  created_at: string;
  signal_id: number | null;
  url: string | null;
  title: string | null;
  org: string;
  subtype: string | null;
  pay_min: number | null;
  pay_max: number | null;
  pay_unit: string | null;
  topics: string[] | null;
  source_name: string;
};

export async function recentChanges(limit = 40, types?: string[], days = 30): Promise<Change[]> {
  return q<Change>(
    `select c.id, c.type, c.detail, c.created_at, c.signal_id, s.url, s.title, coalesce(nullif(s.org, ''), src.config->>'org', '') as org,
       s.subtype, s.pay_min, s.pay_max, s.pay_unit, s.topics, src.name as source_name
     from rd_changes c left join rd_signals s on s.id = c.signal_id left join rd_sources src on src.id = c.source_id
     where c.created_at > now() - make_interval(days => $2) ${types?.length ? "and c.type = any($3::text[])" : ""}
     order by c.created_at desc limit $1`,
    types?.length ? [limit, days, types] : [limit, days],
  );
}

export async function topicMeta() {
  const rows = await q<{ key: string; label: string; color: string; grp: string }>("select key, label, color, grp from rd_topics order by sort");
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}
