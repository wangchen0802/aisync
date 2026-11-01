/**
 * End-to-end pipeline test against a throwaway Postgres, with fetch() routed to fixtures.
 *   DATABASE_URL=postgres://…/radar_test npx tsx --conditions=react-server --test tests/pipeline.e2e.mts
 * The database is wiped first — never point this at real data.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fixtureFetch, makeFixtures } from "./fixtures";

const fx = makeFixtures();
const calls: string[] = [];
globalThis.fetch = fixtureFetch(fx, calls) as typeof fetch;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.X_BEARER_TOKEN;

if (!/radar_test|localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Set DATABASE_URL to a throwaway test database");

const db = await import("@/lib/db");
const pipeline = await import("@/lib/pipeline");
const { q, one } = db;

before(async () => {
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  await p.query("drop table if exists rd_notes, rd_theme_signals, rd_themes, rd_briefs, rd_runs, rd_changes, rd_signals, rd_sources, rd_topics, rd_settings, rd_users cascade");
  await p.end();
});

after(async () => {
  // let the pool close so node exits
  setTimeout(() => process.exit(0), 50).unref();
});

test("fresh database seeds topics and channels", async () => {
  const [t] = await q<{ c: number }>("select count(*)::int as c from rd_topics");
  assert.ok(t.c >= 25);
  const srcs = await q<{ kind: string; enabled: boolean; name: string }>("select kind, enabled, name from rd_sources");
  assert.ok(srcs.some((s) => s.kind === "manual"));
  assert.ok(srcs.filter((s) => s.kind === "x").every((s) => !s.enabled), "X starts paused without a token");
  assert.ok(srcs.filter((s) => s.kind === "greenhouse").length >= 4);
});

test("first run imports everything quietly (baseline, no 'opened' changes)", async () => {
  const res = await pipeline.runDue(120_000, "test");
  const errors = res.filter((r) => r.error);
  assert.deepEqual(errors.map((e) => `${e.name}: ${e.error}`), []);
  const [{ c }] = await q<{ c: number }>("select count(*)::int as c from rd_changes");
  assert.equal(c, 0);

  // lab boards keep only data / environment roles
  const anth = await q<{ title: string }>("select s.title from rd_signals s join rd_sources src on src.id = s.source_id where src.config->>'board' = 'anthropic' order by s.title");
  assert.deepEqual(anth.map((r) => r.title), ["Human Data Lead, Expert Programs", "Research Engineer, RL Environments", "Software Engineer, Post-Training"]);
  const lead = await one<{ subtype: string }>("select subtype from rd_signals where title = 'Human Data Lead, Expert Programs'");
  assert.equal(lead?.subtype, "staff");
  const chem = await one<{ pay_min: number; pay_max: number }>("select pay_min, pay_max from rd_signals where title = 'AI Tutor - Chemistry (PhD)'");
  assert.deepEqual(chem, { pay_min: 45, pay_max: 100 });
  const xai = await q<{ title: string; subtype: string; pay_min: number }>("select s.title, s.subtype, s.pay_min from rd_signals s join rd_sources src on src.id = s.source_id where src.config->>'board' = 'xai' order by s.title");
  assert.equal(xai.length, 2);
  assert.ok(xai.every((r) => r.subtype === "expert" && r.pay_min > 0));

  // vendor board keeps everything and tags experts
  const scale = await q<{ title: string; subtype: string; pay_unit: string | null; topics: string[]; relevance: number }>(
    "select s.title, s.subtype, s.pay_unit, s.topics, s.relevance from rd_signals s join rd_sources src on src.id = s.source_id where src.config->>'board' = 'scaleai'",
  );
  assert.equal(scale.length, 6);
  const md = scale.find((r) => r.title.startsWith("Medical Doctor"))!;
  assert.equal(md.subtype, "expert");
  assert.equal(md.pay_unit, "hr");
  assert.ok(md.topics.includes("medical"));
  const ae = scale.find((r) => r.title.startsWith("Account Executive"))!;
  assert.ok(ae.relevance < md.relevance);

  // community demand posts are recognised
  const demand = await q<{ title: string }>("select title from rd_signals where intent = 'demand'");
  assert.ok(demand.some((d) => d.title.includes("Where do labs buy RL environments")), JSON.stringify(demand));
  const env = await one<{ category: string; topics: string[] }>("select category, topics from rd_signals where title like '%browser environments%'");
  assert.equal(env?.category, "env");

  // ashby compensation text → yearly pay
  const oa = await one<{ pay_min: number; pay_unit: string }>("select pay_min, pay_unit from rd_signals where title = 'Human Data Operations Lead'");
  assert.deepEqual(oa, { pay_min: 245000, pay_unit: "yr" });
  // google news titles drop the publisher suffix
  assert.ok(await one("select 1 from rd_signals where title = 'Surge AI in talks to raise at $25 billion valuation' and author = 'Reuters'"));
  // the same paper / article found by two searches is stored once
  const [{ ax }] = await q<{ ax: number }>("select count(*)::int as ax from rd_signals where channel = 'arxiv'");
  assert.equal(ax, 2);
  const [{ nw }] = await q<{ nw: number }>("select count(*)::int as nw from rd_signals where channel = 'news'");
  assert.equal(nw, 3);
  // arXiv ids drop the version
  assert.ok(await one("select 1 from rd_signals where external_id = 'http://arxiv.org/abs/2610.11111'"));
});

test("second run detects new, closed and pay-changed listings", async () => {
  const jobs = fx.gh.scaleai as { id: number; title: string; content: string; absolute_url: string; location: { name: string }; first_published: string }[];
  fx.gh.scaleai = [
    ...jobs.filter((j) => j.id !== 404), // Account Executive closed
    { id: 407, title: "Robotics Teleoperation Specialist (Contract)", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/407", location: { name: "SF" }, first_published: new Date().toISOString(), content: "&lt;p&gt;Teleoperate humanoid robots to collect manipulation data. $35/hr.&lt;/p&gt;" },
    { id: 408, title: "Cardiologist — AI Training Expert", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/408", location: { name: "Remote" }, first_published: new Date().toISOString(), content: "&lt;p&gt;$150-$220/hr.&lt;/p&gt;" },
  ].map((j) => (j.id === 401 ? { ...j, content: "&lt;p&gt;Write challenging physics problems and grade model reasoning with rubrics. $75-$110/hr.&lt;/p&gt;" } : j));
  await q("update rd_sources set last_run_at = null");
  const res = await pipeline.runDue(120_000, "test");
  assert.deepEqual(res.filter((r) => r.error).map((r) => r.error), []);
  const ch = await q<{ type: string; detail: string }>("select type, detail from rd_changes order by id");
  const types = ch.map((c) => c.type).sort();
  assert.deepEqual(types, ["closed", "opened", "opened", "pay_changed"], JSON.stringify(ch));
  assert.match(ch.find((c) => c.type === "pay_changed")!.detail, /\$60–90\/小时 → \$75–110\/小时/);
  const closed = await one<{ closed_at: string | null }>("select closed_at from rd_signals where title = 'Account Executive, Public Sector'");
  assert.ok(closed?.closed_at);
});

test("a board that suddenly returns nothing is not mass-closed", async () => {
  const keep = fx.gh.scaleai;
  fx.gh.scaleai = [];
  const src = await one<pipeline.SourceRow>("select * from rd_sources where config->>'board' = 'scaleai'");
  const r = await pipeline.runSource(src!, "test");
  fx.gh.scaleai = keep;
  assert.match(r.note ?? "", /跳过下架判断/);
  const [{ c }] = await q<{ c: number }>("select count(*)::int as c from rd_changes where type = 'closed'");
  assert.equal(c, 1);
});

test("a failing source records its error and keeps running others", async () => {
  const bad = await one<pipeline.SourceRow>("insert into rd_sources (kind, name, config) values ('greenhouse', 'Nope', '{\"board\":\"doesnotexist\",\"org\":\"Nope\"}') returning *");
  const r = await pipeline.runSource(bad!, "test");
  assert.match(r.error ?? "", /Greenhouse 返回 404/);
  const s = await one<{ last_error: string }>("select last_error from rd_sources where id = $1", [bad!.id]);
  assert.match(s!.last_error, /404/);
});

test("capture, trends, brief and MCP work on the collected data", async () => {
  const { capture } = await import("@/lib/capture");
  const u = await one<{ id: number }>("insert into rd_users (email, name, role, api_token) values ('a@simreal.ai', 'A', 'admin', 'rd_testtoken') returning id");
  const c = await capture(u!.id, { url: "https://x.com/someone/status/1", text: "We're looking for a vendor to build computer-use environments replicating Salesforce and Workday. DM me.", note: "客户 A" });
  const s = await one<{ channel: string; intent: string; starred: boolean; relevance: number; topics: string[] }>("select channel, intent, starred, relevance, topics from rd_signals where id = $1", [c.id]);
  assert.equal(s?.channel, "x");
  assert.equal(s?.intent, "demand");
  assert.ok(s?.starred && s.relevance >= 60);
  assert.ok(s?.topics.includes("computer_use"));
  const again = await capture(u!.id, { url: "https://x.com/someone/status/1", text: "" });
  assert.ok(again.existed);

  const trends = await import("@/lib/trends");
  const t = await trends.topicTrends();
  const rl = t.find((x) => x.key === "rl_env")!;
  assert.ok(rl.now >= 3, `rl_env this week ${rl.now}`);
  const ov = await trends.overview();
  assert.ok(ov.openListings >= 15 && ov.openExpert >= 6, JSON.stringify(ov));
  assert.ok(ov.medianHourly && ov.medianHourly > 40);
  const pay = await trends.payByTopic();
  assert.ok(pay.length > 0);
  const b = await trends.boards();
  assert.equal(b.find((x) => x.org === "Scale AI")?.closed7, 1);

  const brief = await import("@/lib/brief");
  const st = await brief.collectStats(7);
  const text = brief.contextText(st);
  assert.match(text, /## 方向热度/);
  assert.match(text, /\[#\d+\]/);
  const out = await brief.generateBrief({ send: false });
  assert.equal(out.engine, "stats");
  assert.match(out.body, /## 本周概况/);

  const { mcpPost } = await import("@/lib/mcp");
  const { userByToken } = await import("@/lib/users");
  const me = await userByToken("rd_testtoken");
  const call = async (method: string, params?: unknown) => {
    const res = await mcpPost(new Request("http://x/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), me);
    return (await res.json()) as { result: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean } };
  };
  const tools = await call("tools/list");
  assert.ok(tools.result.tools!.some((x) => x.name === "demand_report"));
  const rep = await call("tools/call", { name: "search_signals", arguments: { topic: "rl_env", days: 30 } });
  assert.ok(!rep.result.isError);
  assert.match(rep.result.content![0].text, /\[#\d+\]/);
  const unauth = await mcpPost(new Request("http://x/api/mcp", { method: "POST", body: "{}" }), null);
  assert.equal(unauth.status, 401);
});
