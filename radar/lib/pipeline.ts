import "server-only";
import { classify, type Pay, type TopicRow } from "@/lib/classify";
import { COLLECTORS, missingEnv, type CollectResult, type RawItem } from "@/lib/collectors";
import { one, q } from "@/lib/db";
import { anyMatch, clip, list, oneLine, sha1 } from "@/lib/text";

export type SourceRow = {
  id: number;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  every_hours: number;
  state: Record<string, unknown>;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_found: number;
  last_new: number;
};

export type RunResult = { source: number; name: string; found: number; new: number; changed: number; error?: string; note?: string };

let topicCache: { at: number; rows: TopicRow[] } | null = null;
export async function loadTopics(fresh = false): Promise<TopicRow[]> {
  if (!fresh && topicCache && Date.now() - topicCache.at < 60_000) return topicCache.rows;
  const rows = await q<TopicRow>("select key, grp, keywords from rd_topics where not archived order by sort");
  topicCache = { at: Date.now(), rows };
  return rows;
}
export const invalidateTopics = () => (topicCache = null);

const fmtPay = (p: { min: number | null; max: number | null; unit: string | null }) =>
  p.min == null ? "未标注" : `$${p.min}${p.max && p.max !== p.min ? `–${p.max}` : ""}${p.unit === "hr" ? "/小时" : "/年"}`;

/** Applies a source's include / exclude keyword filters (title-only for job boards unless match = "all"). */
export function filterItems(items: RawItem[], config: Record<string, unknown>, listing: boolean): RawItem[] {
  const inc = list(config.include);
  const exc = list(config.exclude);
  if (!inc.length && !exc.length) return items;
  const titleOnly = listing ? config.match !== "all" : config.match === "title";
  return items.filter((it) => {
    const text = titleOnly ? it.title : `${it.title}\n${it.body ?? ""}`;
    if (inc.length && !anyMatch(text, inc)) return false;
    if (exc.length && anyMatch(text, exc)) return false;
    return true;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}超时（${Math.round(ms / 1000)} 秒）`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export type Prepared = {
  externalId: string;
  title: string;
  body: string;
  hash: string;
  item: RawItem;
};

export function prepare(item: RawItem): Prepared {
  const body = clip(String(item.body ?? "").trim(), 20000);
  const title = clip(oneLine(item.title || "") || clip(oneLine(body), 140) || "（无标题）", 300);
  return { externalId: clip(String(item.id), 400), title, body, hash: sha1(`${title}\n${body}\n${item.payText ?? ""}`), item };
}

type Existing = { id: number; external_id: string; content_hash: string; closed_at: string | null; pay_min: number | null; pay_max: number | null; pay_unit: string | null; engine: string };

/** Inserts one new signal (classified by rules) and returns its id. */
export async function insertSignal(
  src: { id: number; kind: string; config: Record<string, unknown> },
  p: Prepared,
  topics: TopicRow[],
  extra: { capturedBy?: number; note?: string; channel?: string; intent?: string } = {},
): Promise<number> {
  const def = COLLECTORS[src.kind];
  const channel = extra.channel ?? def?.channel ?? "manual";
  const org = String(p.item.org || src.config.org || "");
  const orgType = String(src.config.org_type || "");
  const c = classify(
    { channel, title: p.title, body: p.body, org, orgType, isListing: Boolean(def?.listing), engagement: p.item.engagement, base: num(src.config.base), payText: p.item.payText },
    topics,
  );
  const row = await one<{ id: number }>(
    `insert into rd_signals (source_id, channel, external_id, url, title, body, author, org, org_type, location, published_at,
       is_listing, subtype, content_hash, category, intent, topics, buyers, vendors, relevance, pay_min, pay_max, pay_unit,
       engagement, raw, captured_by, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     on conflict (source_id, external_id) do update set last_seen_at = now()
     returning id`,
    [
      src.id, channel, p.externalId, p.item.url ?? null, p.title, p.body, clip(p.item.author ?? "", 200), clip(org, 200), orgType,
      clip(p.item.location ?? "", 200), p.item.publishedAt ?? null, Boolean(def?.listing), c.subtype, p.hash, c.category,
      extra.intent || c.intent, c.topics, c.buyers, c.vendors, c.relevance, c.pay?.min ?? null, c.pay?.max ?? null, c.pay?.unit ?? null,
      Math.round(p.item.engagement ?? 0), p.item.raw ? JSON.stringify(p.item.raw) : null, extra.capturedBy ?? null, extra.note ?? "",
    ],
  );
  return row!.id;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

async function updateSignal(src: SourceRow, ex: Existing, p: Prepared, topics: TopicRow[]): Promise<Pay | null> {
  const def = COLLECTORS[src.kind];
  const c = classify(
    {
      channel: def?.channel ?? "manual", title: p.title, body: p.body, org: String(p.item.org || src.config.org || ""), orgType: String(src.config.org_type || ""),
      isListing: Boolean(def?.listing), engagement: p.item.engagement, base: num(src.config.base), payText: p.item.payText,
    },
    topics,
  );
  // Edited text goes back through classification (rules now; AI on the next pass if enabled).
  await q(
    `update rd_signals set title = $2, body = $3, content_hash = $4, url = coalesce($5, url), location = $6, subtype = $7, category = $8,
       intent = $9, topics = $10, buyers = $11, vendors = $12, relevance = $13, pay_min = $14, pay_max = $15, pay_unit = $16,
       engagement = greatest(engagement, $17), engine = 'rules', last_seen_at = now()
     where id = $1`,
    [ex.id, p.title, p.body, p.hash, p.item.url ?? null, clip(p.item.location ?? "", 200), c.subtype, c.category, c.intent, c.topics, c.buyers, c.vendors,
      c.relevance, c.pay?.min ?? null, c.pay?.max ?? null, c.pay?.unit ?? null, Math.round(p.item.engagement ?? 0)],
  );
  return c.pay;
}

export async function addChange(sourceId: number, signalId: number | null, type: string, detail = "") {
  await q("insert into rd_changes (source_id, signal_id, type, detail) values ($1, $2, $3, $4)", [sourceId, signalId, type, clip(detail, 500)]);
}

/** Runs one source end to end: collect → filter → upsert → listing lifecycle → bookkeeping. Never throws. */
export async function runSource(src: SourceRow, trigger = "cron"): Promise<RunResult> {
  const def = COLLECTORS[src.kind];
  const result: RunResult = { source: src.id, name: src.name, found: 0, new: 0, changed: 0 };
  const run = await one<{ id: number; started_at: string }>("insert into rd_runs (source_id, trigger) values ($1, $2) returning id, started_at", [src.id, trigger]);
  try {
    if (!def) throw new Error(`未知的渠道类型：${src.kind}`);
    const missing = missingEnv(def);
    if (missing.length) throw new Error(`需要先配置环境变量 ${missing.join("、")}`);
    const res: CollectResult = await withTimeout(def.collect(src.config, { state: src.state ?? {}, lastOkAt: src.last_ok_at }), 50_000, "抓取");
    const seen = new Set<string>();
    const items = filterItems(res.items, src.config, Boolean(def.listing))
      .map(prepare)
      .filter((p) => (seen.has(p.externalId) ? false : (seen.add(p.externalId), true)));
    result.found = items.length;
    result.note = res.note;

    const topics = await loadTopics();
    const existing = new Map(
      (await q<Existing>("select id, external_id, content_hash, closed_at, pay_min, pay_max, pay_unit, engine from rd_signals where source_id = $1", [src.id])).map((e) => [e.external_id, e]),
    );
    const baseline = !src.last_ok_at; // first successful run: import everything quietly
    const touched: number[] = [];

    // The same article / paper / post often matches several searches: keep the first copy only.
    const urls = def.listing ? [] : items.filter((p) => !existing.has(p.externalId) && p.item.url).map((p) => p.item.url as string);
    const elsewhere = new Set(
      urls.length ? (await q<{ url: string }>("select url from rd_signals where url = any($1::text[]) and source_id <> $2", [urls, src.id])).map((r) => r.url) : [],
    );

    for (const p of items) {
      const ex = existing.get(p.externalId);
      if (!ex && p.item.url && elsewhere.has(p.item.url)) continue;
      if (!ex) {
        const id = await insertSignal(src, p, topics);
        result.new++;
        if (def.listing && !baseline) await addChange(src.id, id, "opened", p.title);
        if (res.pageChange) await addChange(src.id, id, "page_changed", p.title);
        continue;
      }
      touched.push(ex.id);
      if (ex.closed_at) {
        await q("update rd_signals set closed_at = null where id = $1", [ex.id]);
        await addChange(src.id, ex.id, "reopened", p.title);
        result.changed++;
      }
      if (ex.content_hash !== p.hash) {
        const pay = await updateSignal(src, ex, p, topics);
        const was = { min: ex.pay_min, max: ex.pay_max, unit: ex.pay_unit };
        if (def.listing && ((pay?.min ?? null) !== was.min || (pay?.max ?? null) !== was.max)) {
          await addChange(src.id, ex.id, "pay_changed", `${p.title}：${fmtPay(was)} → ${fmtPay({ min: pay?.min ?? null, max: pay?.max ?? null, unit: pay?.unit ?? null })}`);
          result.changed++;
        }
      }
    }
    if (touched.length) await q("update rd_signals set last_seen_at = now() where id = any($1::int[])", [touched]);

    const stateOut: Record<string, unknown> = { ...(res.state ?? {}) };
    if (def.listing && res.complete) {
      const open = existing.size ? [...existing.values()].filter((e) => !e.closed_at).length : 0;
      // A board that suddenly returns (almost) nothing is more likely broken than emptied: hold off closing
      // listings until it looks the same on two more runs.
      const suspicious = (items.length === 0 && open >= 3) || (open > 10 && items.length < open * 0.3);
      const strikes = Number(src.state?.suspect ?? 0);
      if (suspicious && strikes < 2) {
        stateOut.suspect = strikes + 1;
        result.note = `本次只返回 ${items.length} 条（之前 ${open} 条在招），先跳过下架判断`;
      } else {
        stateOut.suspect = 0;
        const closed = await q<{ id: number; title: string }>(
          `update rd_signals set closed_at = now() where source_id = $1 and is_listing and closed_at is null and last_seen_at < $2 returning id, title`,
          [src.id, run!.started_at],
        );
        for (const c of closed) await addChange(src.id, c.id, "closed", c.title);
        result.changed += closed.length;
      }
    }

    await q(
      `update rd_sources set state = state || $2::jsonb, last_run_at = now(), last_ok_at = now(), last_error = null, last_found = $3, last_new = $4 where id = $1`,
      [src.id, JSON.stringify(stateOut), result.found, result.new],
    );
    await q("update rd_runs set finished_at = now(), found = $2, new = $3, changed = $4, error = $5 where id = $1", [run!.id, result.found, result.new, result.changed, result.note ?? null]);
  } catch (e) {
    result.error = clip((e as Error).message || String(e), 400);
    await q("update rd_sources set last_run_at = now(), last_error = $2 where id = $1", [src.id, result.error]);
    await q("update rd_runs set finished_at = now(), error = $2 where id = $1", [run!.id, result.error]);
  }
  return result;
}

/** Dry run for the "试运行" button: collects and filters, returns a preview, writes nothing. */
export async function previewSource(kind: string, config: Record<string, unknown>) {
  const def = COLLECTORS[kind];
  if (!def) throw new Error(`未知的渠道类型：${kind}`);
  const missing = missingEnv(def);
  if (missing.length) throw new Error(`需要先配置环境变量 ${missing.join("、")}`);
  const res = await withTimeout(def.collect(config, { state: {}, lastOkAt: null }), 40_000, "抓取");
  const all = res.items.length;
  const items = filterItems(res.items, config, Boolean(def.listing)).map(prepare);
  const topics = await loadTopics();
  return {
    total: all,
    kept: items.length,
    note: res.note,
    sample: items.slice(0, 8).map((p) => {
      const c = classify({ channel: def.channel, title: p.title, body: p.body, org: String(config.org ?? ""), orgType: String(config.org_type ?? ""), isListing: Boolean(def.listing), payText: p.item.payText, base: num(config.base) }, topics);
      return { title: p.title, url: p.item.url ?? null, relevance: c.relevance, topics: c.topics, pay: c.pay };
    }),
  };
}

/** Runs every source that is due, within a time budget (serverless functions have a hard limit). */
export async function runDue(budgetMs = 200_000, trigger = "cron", onlyIds?: number[]): Promise<RunResult[]> {
  const started = Date.now();
  const due = onlyIds?.length
    ? await q<SourceRow>("select * from rd_sources where id = any($1::int[]) and kind <> 'manual'", [onlyIds])
    : await q<SourceRow>(
        `select * from rd_sources where enabled and kind <> 'manual'
           and (last_run_at is null or last_run_at < now() - make_interval(hours => every_hours) + interval '15 minutes')
         order by last_run_at nulls first`,
      );
  // Sources of the same kind run one after another (they overlap the most, and cross-source dedupe relies on
  // seeing each other's inserts); different kinds run in parallel.
  const groups = [...due.reduce((m, s) => m.set(s.kind, [...(m.get(s.kind) ?? []), s]), new Map<string, SourceRow[]>()).values()];
  const results: RunResult[] = [];
  let g = 0;
  const worker = async () => {
    while (g < groups.length) {
      for (const src of groups[g++]) {
        if (Date.now() - started > budgetMs) return;
        results.push(await runSource(src, trigger));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker));
  return results;
}
