import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, extractPay } from "@/lib/classify";
import { DEFAULT_TOPICS } from "@/lib/taxonomy";
import { htmlToText, keywordRegex } from "@/lib/text";
import { parseFeed } from "@/lib/feed";

const topics = DEFAULT_TOPICS.map((t) => ({ key: t.key, grp: t.grp, keywords: t.keywords }));

test("pay: hourly ranges, k-salaries, cues", () => {
  assert.deepEqual(extractPay("Pay: $40 - $60/hour, remote"), { min: 40, max: 60, unit: "hr" });
  assert.deepEqual(extractPay("$150K – $250K • Offers Equity"), { min: 150000, max: 250000, unit: "yr" });
  assert.deepEqual(extractPay("Up to $120 per hour depending on expertise"), { min: 120, max: 120, unit: "hr" });
  assert.deepEqual(extractPay("salary $180,000 to $240,000 USD annually; or $95/hr contract"), { min: 95, max: 95, unit: "hr" });
  assert.equal(extractPay("We raised $50 million"), null);
  assert.equal(extractPay("Costs $20 to try"), null);
});

test("keyword matching: boundaries, plurals, CJK", () => {
  assert.ok(keywordRegex("rl environment")!.test("building RL environments for labs"));
  assert.ok(keywordRegex("rl environment")!.test("RL-environment"));
  assert.ok(!keywordRegex("java")!.test("javascript only"));
  assert.ok(keywordRegex("c++")!.test("Strong C++ skills"));
  assert.ok(keywordRegex("强化学习环境")!.test("我们在找强化学习环境供应商"));
  assert.ok(!keywordRegex("eval")!.test("medieval history"));
});

test("expert listing at a vendor → hiring, expert, data, pay, domain", () => {
  const c = classify(
    {
      channel: "jobs", isListing: true, org: "Scale AI", orgType: "vendor",
      title: "Physics PhD Expert — AI Training (Contract)",
      body: "Help train frontier AI models by writing challenging physics problems and grading model reasoning with rubrics. $60-$90/hr. We offer medical, dental and vision insurance.",
    },
    topics,
  );
  assert.equal(c.intent, "hiring");
  assert.equal(c.subtype, "expert");
  assert.equal(c.category, "data");
  assert.deepEqual(c.pay, { min: 60, max: 90, unit: "hr" });
  assert.ok(c.topics.includes("science"));
  assert.ok(c.topics.includes("rubric"));
  assert.ok(!c.topics.includes("medical"), "benefits boilerplate must not tag medical");
  assert.ok(!c.topics.includes("vision"));
  assert.ok(c.vendors.includes("Scale AI"));
  assert.ok(c.relevance >= 70, `relevance ${c.relevance}`);
});

test("RL environment demand post → demand, env, high relevance", () => {
  const c = classify(
    { channel: "x", title: "", body: "We're looking for a vendor who builds RL environments for computer-use agents (Salesforce / Jira replicas). DM me. Will pay well.", engagement: 120 },
    topics,
  );
  assert.equal(c.intent, "demand");
  assert.equal(c.category, "env");
  assert.ok(c.topics.includes("rl_env") && c.topics.includes("computer_use") && c.topics.includes("enterprise"));
  assert.ok(c.relevance >= 75, `relevance ${c.relevance}`);
});

test("Chinese demand post", () => {
  const c = classify({ channel: "manual", title: "求购中文医疗推理数据", body: "有没有团队能做医学CoT数据，大模型后训练用" }, topics);
  assert.equal(c.intent, "demand");
  assert.ok(c.topics.includes("medical") && c.topics.includes("chinese"));
});

test("unrelated staff listing stays low", () => {
  const c = classify({ channel: "jobs", isListing: true, org: "Scale AI", orgType: "vendor", title: "Account Executive, Public Sector", body: "Sell to government agencies." }, topics);
  assert.equal(c.subtype, "staff");
  assert.ok(c.relevance < 50, `relevance ${c.relevance}`);
});

test("news: funding of a vendor", () => {
  const c = classify({ channel: "news", title: "Mercor raises $350M at $10B valuation as labs buy expert data", body: "" }, topics);
  assert.equal(c.intent, "news");
  assert.ok(c.vendors.includes("Mercor"));
  assert.ok(!c.buyers.includes("Meta"));
});

test("Meta matcher ignores metadata", () => {
  const c = classify({ channel: "hn", title: "Metadata extraction tools", body: "meta-learning and metadata" }, topics);
  assert.ok(!c.buyers.includes("Meta"));
  const d = classify({ channel: "hn", title: "Meta signs data deal for Llama 5 training", body: "" }, topics);
  assert.ok(d.buyers.includes("Meta"));
});

test("html to text handles encoded greenhouse html", () => {
  const t = htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;");
  assert.equal(t, "Hello & welcome\n• One");
});

test("feed parser: RSS and Atom", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Scale AI lands deal]]></title><link>https://news.example/a</link><guid>a1</guid><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description>&lt;b&gt;Big&lt;/b&gt; news</description><source url="https://x.com">Reuters</source></item></channel></rss>`;
  const [i] = parseFeed(rss);
  assert.equal(i.title, "Scale AI lands deal");
  assert.equal(i.link, "https://news.example/a");
  assert.equal(i.summary, "Big news");
  assert.equal(i.source, "Reuters");
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2610.01234v1</id><title>Scaling RL
 Environments</title><summary>We build 10k environments.</summary><published>2026-10-20T00:00:00Z</published><author><name>A. Researcher</name></author><author><name>B. Person</name></author><link href="http://arxiv.org/abs/2610.01234v1" rel="alternate" type="text/html"/><link title="pdf" href="http://arxiv.org/pdf/2610.01234v1" rel="related"/></entry></feed>`;
  const [a] = parseFeed(atom);
  assert.equal(a.title, "Scaling RL Environments");
  assert.equal(a.link, "http://arxiv.org/abs/2610.01234v1");
  assert.equal(a.author, "A. Researcher, B. Person");
});

test("pay: unit repeated inside the range", () => {
  assert.deepEqual(extractPay("Write and grade chemistry problems. $45/hr - $100/hr."), { min: 45, max: 100, unit: "hr" });
  assert.deepEqual(extractPay("$35 - $65 per hour"), { min: 35, max: 65, unit: "hr" });
});

test("listing subtype: staff titles that mention experts stay staff", () => {
  const t = (title: string) => classify({ channel: "jobs", isListing: true, title, body: "" }, topics).subtype;
  assert.equal(t("Human Data Lead, Expert Programs"), "staff");
  assert.equal(t("Software Engineer, RL Environments Platform"), "staff");
  assert.equal(t("Physics PhD Expert — AI Training (Contract)"), "expert");
  assert.equal(t("Software Engineer — Coding Expert (Contract)"), "expert");
  assert.equal(t("AI Tutor - Japanese Language"), "expert");
  assert.equal(t("Computer Use Agent Trainer — Enterprise SaaS workflows"), "expert");
});
