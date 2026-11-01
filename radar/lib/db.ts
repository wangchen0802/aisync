import { Pool, types, type QueryResultRow } from "pg";

// Timestamps as ISO strings so they serialize cleanly into client components.
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());
types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD"
types.setTypeParser(1700, (v) => Number(v)); // numeric → number
types.setTypeParser(20, (v) => Number(v)); // bigint (count) → number

// Every table is prefixed rd_ so Radar can share a database with SimReal Sync.
const SCHEMA = `
select pg_advisory_xact_lock(727301);
create table if not exists rd_users (
  id serial primary key,
  email text unique not null,
  name text,
  image text,
  role text not null default 'member',
  api_token text unique,
  created_at timestamptz not null default now()
);
create table if not exists rd_settings (key text primary key, value text not null);
create table if not exists rd_topics (
  key text primary key,
  label text not null,
  grp text not null default 'domain',
  keywords text[] not null default '{}',
  color text not null default '#3e63dd',
  sort int not null default 0,
  archived boolean not null default false
);
create table if not exists rd_sources (
  id serial primary key,
  kind text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  every_hours int not null default 24,
  state jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_found int not null default 0,
  last_new int not null default 0,
  created_by int references rd_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists rd_signals (
  id serial primary key,
  source_id int not null references rd_sources(id) on delete cascade,
  channel text not null,
  external_id text not null,
  url text,
  title text not null default '',
  body text not null default '',
  author text not null default '',
  org text not null default '',
  org_type text not null default '',
  location text not null default '',
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  is_listing boolean not null default false,
  subtype text not null default '',
  content_hash text not null default '',
  category text not null default 'other',
  intent text not null default 'discussion',
  topics text[] not null default '{}',
  buyers text[] not null default '{}',
  vendors text[] not null default '{}',
  relevance int not null default 0,
  pay_min double precision,
  pay_max double precision,
  pay_unit text,
  summary text not null default '',
  engine text not null default 'rules',
  engagement int not null default 0,
  starred boolean not null default false,
  dismissed boolean not null default false,
  note text not null default '',
  captured_by int references rd_users(id) on delete set null,
  raw jsonb,
  unique (source_id, external_id)
);
create index if not exists rd_signals_seen_idx on rd_signals(first_seen_at desc);
create index if not exists rd_signals_pub_idx on rd_signals((coalesce(published_at, first_seen_at)) desc);
create index if not exists rd_signals_topics_idx on rd_signals using gin(topics);
create index if not exists rd_signals_listing_idx on rd_signals(is_listing, closed_at);
create index if not exists rd_signals_url_idx on rd_signals(url);
create index if not exists rd_signals_engine_idx on rd_signals(engine) where engine = 'rules';
create table if not exists rd_changes (
  id serial primary key,
  source_id int references rd_sources(id) on delete cascade,
  signal_id int references rd_signals(id) on delete cascade,
  type text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists rd_changes_created_idx on rd_changes(created_at desc);
create table if not exists rd_runs (
  id serial primary key,
  source_id int references rd_sources(id) on delete cascade,
  trigger text not null default 'cron',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found int not null default 0,
  new int not null default 0,
  changed int not null default 0,
  error text
);
create index if not exists rd_runs_source_idx on rd_runs(source_id, started_at desc);
create table if not exists rd_themes (
  id serial primary key,
  title text not null,
  thesis text not null default '',
  status text not null default 'watching',
  topics text[] not null default '{}',
  owner_id int references rd_users(id) on delete set null,
  next_step text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists rd_theme_signals (
  theme_id int references rd_themes(id) on delete cascade,
  signal_id int references rd_signals(id) on delete cascade,
  note text not null default '',
  added_by int references rd_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (theme_id, signal_id)
);
create table if not exists rd_notes (
  id serial primary key,
  theme_id int references rd_themes(id) on delete cascade,
  user_id int references rd_users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists rd_briefs (
  id serial primary key,
  week date unique not null,
  stats jsonb not null default '{}'::jsonb,
  body text not null default '',
  engine text not null default 'stats',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
`;

/** Vercel's Neon integration names the variable after the chosen prefix; accept the common ones. */
const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL || "";
export const dbConfigured = () => Boolean(dbUrl());

const g = globalThis as unknown as { __radarPool?: Pool; __radarSchema?: Promise<void> };

function pool(): Pool {
  if (!dbUrl()) throw new Error("DATABASE_URL 未配置。请在 Vercel 项目里连接一个 Postgres 数据库（Storage → Neon）。");
  if (!g.__radarPool) g.__radarPool = new Pool({ connectionString: dbUrl(), max: 5, idleTimeoutMillis: 10_000 });
  return g.__radarPool;
}

function ensureSchema(): Promise<void> {
  if (!g.__radarSchema) {
    g.__radarSchema = pool()
      .query(SCHEMA)
      .then(async () => {
        // A fresh database also gets the default topics and channels (imported lazily: seed.ts imports this file).
        const { seed } = await import("@/lib/seed");
        await seed();
      })
      .catch((e) => {
        g.__radarSchema = undefined;
        throw e;
      });
  }
  return g.__radarSchema;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Raw query without the schema check — only for the seeder, which runs inside ensureSchema. */
export async function rawQ<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const r = await one<{ value: string }>("select value from rd_settings where key = $1", [key]);
  return r?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await q("insert into rd_settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, value]);
}
