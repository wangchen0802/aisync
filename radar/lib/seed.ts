import { rawQ } from "@/lib/db";
import { PRESETS } from "@/lib/catalog";
import { COLLECTORS, missingEnv } from "@/lib/collectors";
import { DEFAULT_TOPICS } from "@/lib/taxonomy";

/** Loads default topics and channels into a fresh database (once; later edits are never overwritten). */
export async function seed() {
  const done = await rawQ<{ value: string }>("select value from rd_settings where key = 'seeded_v1'");
  if (done.length) return;
  const topics = await rawQ<{ c: number }>("select count(*)::int as c from rd_topics");
  if (!topics[0]?.c) {
    for (const [i, t] of DEFAULT_TOPICS.entries()) {
      await rawQ("insert into rd_topics (key, label, grp, keywords, color, sort) values ($1, $2, $3, $4, $5, $6) on conflict (key) do nothing", [
        t.key, t.label, t.grp, t.keywords, t.color, i,
      ]);
    }
  }
  const sources = await rawQ<{ c: number }>("select count(*)::int as c from rd_sources");
  if (!sources[0]?.c) {
    await rawQ("insert into rd_sources (kind, name, config, enabled, every_hours) values ('manual', '手动收录', '{}'::jsonb, true, 24)");
    for (const p of PRESETS.filter((x) => x.seed)) {
      const def = COLLECTORS[p.kind];
      // Channels that need a credential start paused until it is configured.
      const enabled = def ? missingEnv(def).length === 0 : false;
      await rawQ("insert into rd_sources (kind, name, config, enabled, every_hours, state) values ($1, $2, $3, $4, $5, $6)", [
        p.kind, p.name, JSON.stringify(p.config), enabled, p.every_hours ?? 24, JSON.stringify({ preset: p.id }),
      ]);
    }
  }
  await rawQ("insert into rd_settings (key, value) values ('seeded_v1', $1) on conflict (key) do nothing", [new Date().toISOString()]);
}
