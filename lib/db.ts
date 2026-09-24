import { Pool, types, type QueryResultRow } from "pg";

// Return timestamps as ISO strings so they serialize cleanly to client components.
types.setTypeParser(1184, (v) => new Date(v).toISOString());
types.setTypeParser(1114, (v) => new Date(v + "Z").toISOString());
types.setTypeParser(1082, (v) => v); // date → "YYYY-MM-DD"

const SCHEMA = `
select pg_advisory_xact_lock(727201);
create table if not exists users (
  id serial primary key,
  email text unique not null,
  name text,
  image text,
  role text not null default 'member',
  api_token text unique,
  invited boolean not null default false,
  last_ingest_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists projects (
  id serial primary key,
  name text not null,
  color text not null default '#3E63DD',
  description text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists conversations (
  id serial primary key,
  user_id int references users(id) on delete cascade,
  source text not null default 'other',
  title text not null default '',
  url text,
  raw_text text not null default '',
  summary text not null default '',
  status text not null default 'pending',
  project_id int references projects(id) on delete set null,
  engine text not null default 'ai',
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists items (
  id serial primary key,
  kind text not null,
  title text not null,
  body text not null default '',
  details jsonb not null default '{}'::jsonb,
  status text not null,
  visibility text not null default 'team',
  owner_id int references users(id) on delete set null,
  assignee_id int references users(id) on delete set null,
  project_id int references projects(id) on delete set null,
  conversation_id int references conversations(id) on delete set null,
  source text not null default 'manual',
  due text,
  subtasks jsonb not null default '[]'::jsonb,
  conflict_with int,
  superseded_by int,
  blocked_by int,
  duplicate_of int,
  last_update text,
  last_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists items_kind_vis_idx on items(kind, visibility);
create index if not exists items_conv_idx on items(conversation_id);
create table if not exists acks (
  item_id int references items(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  verdict text not null,
  comment text,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create table if not exists events (
  id serial primary key,
  user_id int references users(id) on delete set null,
  type text not null,
  item_id int references items(id) on delete cascade,
  conversation_id int references conversations(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on events(created_at desc);
create table if not exists settings (
  key text primary key,
  value text not null
);
create table if not exists comments (
  id serial primary key,
  item_id int references items(id) on delete cascade,
  user_id int references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_item_idx on comments(item_id, created_at);
alter table users add column if not exists auto_publish boolean not null default false;
alter table users add column if not exists seen_at timestamptz;
alter table users add column if not exists prev_seen_at timestamptz;
alter table conversations add column if not exists external_key text;
alter table items add column if not exists last_update_source text;
alter table items add column if not exists due_date date;
alter table items add column if not exists goal_id int;
alter table items add column if not exists completed_at timestamptz;
alter table users add column if not exists lark_open_id text;
alter table users add column if not exists context_key text unique;
alter table projects add column if not exists context text not null default '';
create table if not exists goals (
  id serial primary key,
  title text not null,
  scope text not null default 'team',
  owner_id int references users(id) on delete set null,
  project_id int references projects(id) on delete set null,
  week date not null,
  status text not null default 'on_track',
  manual_progress int,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_week_idx on goals(week);
create index if not exists conversations_key_idx on conversations(user_id, external_key);
create table if not exists rounds (
  id serial primary key,
  name text not null,
  target double precision not null default 0,
  currency text not null default 'USD',
  instrument text not null default '',
  valuation text not null default '',
  close_date date,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create table if not exists contacts (
  id serial primary key,
  pipeline text not null default 'investor',
  name text not null default '',
  org text not null default '',
  title text not null default '',
  email text not null default '',
  handle text not null default '',
  link text not null default '',
  stage text not null default 'target',
  heat text not null default 'warm',
  owner_id int references users(id) on delete set null,
  round_id int references rounds(id) on delete set null,
  amount double precision,
  source text not null default '',
  intro_by text not null default '',
  next_step text not null default '',
  next_date date,
  last_touch_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_pipeline_idx on contacts(pipeline, stage);
create table if not exists touches (
  id serial primary key,
  contact_id int references contacts(id) on delete cascade,
  user_id int references users(id) on delete set null,
  kind text not null default 'note',
  body text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists touches_contact_idx on touches(contact_id, created_at desc);
`;

/** Vercel's Neon integration names the variable after the chosen prefix; accept the common ones. */
const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL || "";

const g = globalThis as unknown as { __simrealPool?: Pool; __simrealSchema?: Promise<void> };

function pool(): Pool {
  if (!dbUrl()) {
    throw new Error("DATABASE_URL 未配置。请在 Vercel 项目里连接一个 Postgres 数据库（Storage → Neon）。");
  }
  if (!g.__simrealPool) {
    g.__simrealPool = new Pool({ connectionString: dbUrl(), max: 5, idleTimeoutMillis: 10_000 });
  }
  return g.__simrealPool;
}

function ensureSchema(): Promise<void> {
  if (!g.__simrealSchema) {
    g.__simrealSchema = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        g.__simrealSchema = undefined;
        throw e;
      });
  }
  return g.__simrealSchema;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  try {
    return (await pool().query<T>(text, params)).rows;
  } catch (e) {
    // Tables vanished (e.g. database reset while the server was warm): recreate once and retry.
    if ((e as { code?: string }).code !== "42P01") throw e;
    g.__simrealSchema = undefined;
    await ensureSchema();
    return (await pool().query<T>(text, params)).rows;
  }
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction on a dedicated client. */
export async function tx<T>(fn: (run: typeof q) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool().connect();
  const run = (async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows) as typeof q;
  try {
    await client.query("begin");
    const out = await fn(run);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export function dbConfigured() {
  return Boolean(dbUrl());
}
