/** Realistic API responses for the end-to-end test (the real endpoints aren't reachable from CI sandboxes). */

const day = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

export type Fixtures = ReturnType<typeof makeFixtures>;

export function makeFixtures() {
  return {
    gh: {
      anthropic: [
        { id: 101, title: "Research Engineer, RL Environments", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/101", location: { name: "San Francisco" }, first_published: day(40),
          content: "&lt;p&gt;Build the environments we use to train Claude on agentic coding and computer use. You will design verifiers and reward functions, and work with external RL environment vendors.&lt;/p&gt;&lt;p&gt;The annual compensation range is $340,000 - $425,000 USD.&lt;/p&gt;&lt;p&gt;We offer medical, dental and vision insurance.&lt;/p&gt;" },
        { id: 102, title: "Human Data Lead, Expert Programs", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/102", location: { name: "San Francisco" }, first_published: day(12),
          content: "&lt;p&gt;Partner with data vendors such as Surge AI and Mercor to source domain experts in medicine, law and finance for post-training data. Own rubrics and quality.&lt;/p&gt;&lt;p&gt;$290,000—$360,000 USD&lt;/p&gt;" },
        { id: 103, title: "Account Executive, Enterprise", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/103", location: { name: "New York" }, first_published: day(5), content: "&lt;p&gt;Sell Claude.&lt;/p&gt;" },
        { id: 104, title: "Software Engineer, Post-Training", absolute_url: "https://job-boards.greenhouse.io/anthropic/jobs/104", location: { name: "London" }, first_published: day(3), content: "&lt;p&gt;Infrastructure for RLHF and reinforcement learning from verifiable rewards.&lt;/p&gt;" },
      ],
      deepmind: [
        { id: 201, title: "Research Scientist, Gemini Post-Training Data", absolute_url: "https://job-boards.greenhouse.io/deepmind/jobs/201", location: { name: "London" }, first_published: day(20), content: "&lt;p&gt;Improve Gemini through better SFT and preference data, including multilingual and coding.&lt;/p&gt;" },
        { id: 202, title: "Data Partnerships Manager", absolute_url: "https://job-boards.greenhouse.io/deepmind/jobs/202", location: { name: "Mountain View" }, first_published: day(9), content: "&lt;p&gt;Negotiate content licensing deals for video and audio training data.&lt;/p&gt;" },
        { id: 203, title: "Product Manager, Pixel", absolute_url: "https://job-boards.greenhouse.io/deepmind/jobs/203", location: { name: "Mountain View" }, first_published: day(9), content: "&lt;p&gt;Phones.&lt;/p&gt;" },
      ],
      xai: [
        { id: 301, title: "AI Tutor - Chemistry (PhD)", absolute_url: "https://job-boards.greenhouse.io/xai/jobs/301", location: { name: "Remote" }, first_published: day(6), content: "&lt;p&gt;Write and grade chemistry reasoning problems for Grok. $45/hr - $100/hr.&lt;/p&gt;" },
        { id: 302, title: "AI Tutor - Japanese Language", absolute_url: "https://job-boards.greenhouse.io/xai/jobs/302", location: { name: "Remote" }, first_published: day(2), content: "&lt;p&gt;Native speaker of Japanese. $35 - $65 per hour.&lt;/p&gt;" },
        { id: 303, title: "Backend Engineer, Grok", absolute_url: "https://job-boards.greenhouse.io/xai/jobs/303", location: { name: "Palo Alto" }, first_published: day(2), content: "&lt;p&gt;APIs.&lt;/p&gt;" },
      ],
      scaleai: [
        { id: 401, title: "Physics PhD Expert — AI Training (Contract)", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/401", location: { name: "Remote" }, first_published: day(30), content: "&lt;p&gt;Write challenging physics problems and grade model reasoning with rubrics. $60-$90/hr.&lt;/p&gt;" },
        { id: 402, title: "Medical Doctor (MD) - AI Model Evaluation", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/402", location: { name: "Remote" }, first_published: day(18), content: "&lt;p&gt;Physicians evaluate frontier model answers to clinical questions. $120 - $180 per hour.&lt;/p&gt;" },
        { id: 403, title: "Software Engineer, RL Environments Platform", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/403", location: { name: "San Francisco" }, first_published: day(14), content: "&lt;p&gt;Build the platform that serves RL environments to frontier labs. $180,000 - $250,000 USD.&lt;/p&gt;" },
        { id: 404, title: "Account Executive, Public Sector", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/404", location: { name: "DC" }, first_published: day(60), content: "&lt;p&gt;Sell to government agencies.&lt;/p&gt;" },
        { id: 405, title: "Lawyer (JD) - Legal Reasoning Expert, AI Training", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/405", location: { name: "Remote" }, first_published: day(8), content: "&lt;p&gt;Attorneys write legal reasoning tasks and rubrics. $90 - $150/hr.&lt;/p&gt;" },
        { id: 406, title: "Computer Use Agent Trainer — Enterprise SaaS workflows", absolute_url: "https://job-boards.greenhouse.io/scaleai/jobs/406", location: { name: "Remote" }, first_published: day(4), content: "&lt;p&gt;Record trajectories completing tasks in Salesforce, SAP and Jira for computer-use agents. $40-55/hr.&lt;/p&gt;" },
      ],
    } as Record<string, unknown[]>,
    ashby: {
      openai: [
        { id: "a1", title: "Human Data Operations Lead", jobUrl: "https://jobs.ashbyhq.com/openai/a1", location: "San Francisco", publishedAt: day(15), descriptionPlain: "Run expert data programs with vendors for post-training. Scale our human data operations.", compensation: { compensationTierSummary: "$245K – $385K • Offers Equity" }, isListed: true },
        { id: "a2", title: "Research Engineer, Environments", jobUrl: "https://jobs.ashbyhq.com/openai/a2", location: "San Francisco", publishedAt: day(1), descriptionPlain: "Build RL environments and graders for agentic tasks: browsers, terminals and enterprise software.", compensation: { compensationTierSummary: "$310K – $460K" }, isListed: true },
        { id: "a3", title: "Sales Director", jobUrl: "https://jobs.ashbyhq.com/openai/a3", location: "NYC", publishedAt: day(1), descriptionPlain: "Sell ChatGPT Enterprise.", isListed: true },
      ],
    } as Record<string, unknown[]>,
    lever: {
      mistral: [
        { id: "l1", text: "Data Acquisition Manager (Multilingual)", hostedUrl: "https://jobs.lever.co/mistral/l1", categories: { location: "Paris" }, createdAt: Date.now() - 11 * 86400_000, descriptionPlain: "License multilingual pretraining corpora and source native speaker data in French, German and Arabic.", lists: [] },
        { id: "l2", text: "Frontend Engineer", hostedUrl: "https://jobs.lever.co/mistral/l2", categories: { location: "Paris" }, createdAt: Date.now() - 3 * 86400_000, descriptionPlain: "React.", lists: [] },
      ],
    } as Record<string, unknown[]>,
    reddit: {
      "outlier_ai+DataAnnotationTech": [
        { name: "t3_r1", permalink: "/r/outlier_ai/comments/r1/", title: "Coding projects everywhere this week, $45/hr for Python + TypeScript", selftext: "Got invited to three new coding projects writing SWE tasks with unit tests. Looks like a big lab push.", author: "tasker1", subreddit: "outlier_ai", created_utc: Date.now() / 1000 - 2 * 86400, score: 120, num_comments: 40 },
        { name: "t3_r2", permalink: "/r/DataAnnotationTech/comments/r2/", title: "Empty queue for two weeks on generalist projects", selftext: "No tasks at all on the generalist side, but the chemistry and physics experts are busy.", author: "tasker2", subreddit: "DataAnnotationTech", created_utc: Date.now() / 1000 - 3 * 86400, score: 60, num_comments: 33 },
        { name: "t3_r3", permalink: "/r/outlier_ai/comments/r3/", title: "New project: grading agent trajectories in a simulated CRM", selftext: "We review computer use trajectories in a fake Salesforce environment and write rubrics.", author: "tasker3", subreddit: "outlier_ai", created_utc: Date.now() / 1000 - 1 * 86400, score: 45, num_comments: 12 },
      ],
      "MachineLearning+LocalLLaMA+reinforcementlearning": [
        { name: "t3_m1", permalink: "/r/MachineLearning/comments/m1/", title: "[D] Where do labs buy RL environments? Looking for a vendor for SWE environments", selftext: "We need ~2k verifiable software engineering environments with Docker images. Who sells these?", author: "mlpi", subreddit: "MachineLearning", created_utc: Date.now() / 1000 - 4 * 86400, score: 88, num_comments: 51 },
        { name: "t3_m2", permalink: "/r/LocalLLaMA/comments/m2/", title: "Anyone selling high quality reasoning traces for math?", selftext: "Looking for chain-of-thought data for olympiad math, will pay.", author: "q", subreddit: "LocalLLaMA", created_utc: Date.now() / 1000 - 5 * 86400, score: 23, num_comments: 9 },
      ],
    } as Record<string, unknown[]>,
    hn: [
      { objectID: "h1", title: "Show HN: Open-source gym of 500 browser environments for computer-use agents", url: "https://github.com/example/browsergym500", author: "builder", created_at: day(2), points: 210, num_comments: 64 },
      { objectID: "h2", title: null, story_title: "Ask HN: Who is hiring? (November 2026)", comment_text: "Acme Envs (YC W26) | RL environment engineers | Remote | We build replicas of enterprise apps (SAP, ServiceNow) as RL environments for frontier labs. $200k-$260k", author: "acme", created_at: day(1), points: null, num_comments: null },
      { objectID: "h3", title: "Mercor raises $500M as AI labs pay experts $200/hr", url: "https://news.example/mercor", author: "news", created_at: day(6), points: 150, num_comments: 120 },
    ],
    arxiv: `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>http://arxiv.org/abs/2610.11111v2</id><title>Scaling Verifiable Environments for Software Agents</title><summary>We build 10,000 verifiable RL environments from GitHub repositories and show reinforcement learning with verifiable rewards improves SWE-bench.</summary><published>${day(3)}</published><author><name>A. Researcher</name></author><link href="http://arxiv.org/abs/2610.11111v2" rel="alternate"/></entry>
<entry><id>http://arxiv.org/abs/2610.22222v1</id><title>Expert Rubrics Beat Preference Data for Medical Reasoning</title><summary>Physician-written rubrics as rewards outperform pairwise preference data on clinical benchmarks.</summary><published>${day(5)}</published><author><name>B. Doctor</name></author><link href="http://arxiv.org/abs/2610.22222v1" rel="alternate"/></entry>
</feed>`,
    hf: [
      { id: "acme/browser-env-trajectories", author: "acme", createdAt: day(4), likes: 41, downloads: 3200, tags: ["task_categories:reinforcement-learning", "modality:text", "region:us"], description: "Computer use trajectories collected in 120 web environments." },
    ],
    github: { items: [{ id: 9001, full_name: "openenv/swe-gym-envs", html_url: "https://github.com/openenv/swe-gym-envs", description: "Verifiable SWE RL environments with Docker and test-based rewards", topics: ["reinforcement-learning", "rl-environments"], owner: { login: "openenv" }, created_at: day(9), stargazers_count: 870, forks_count: 60 }] },
    news: `<?xml version="1.0"?><rss><channel>
<item><title>Surge AI in talks to raise at $25 billion valuation - Reuters</title><link>https://news.google.com/a1</link><guid>g1</guid><pubDate>${new Date(Date.now() - 2 * 86400_000).toUTCString()}</pubDate><description>Surge AI in talks to raise at $25 billion valuation</description><source url="https://reuters.com">Reuters</source></item>
<item><title>Startups race to build RL environments for AI labs - TechCrunch</title><link>https://news.google.com/a2</link><guid>g2</guid><pubDate>${new Date(Date.now() - 4 * 86400_000).toUTCString()}</pubDate><description>Labs are spending heavily on reinforcement learning environments that replicate enterprise software.</description><source url="https://techcrunch.com">TechCrunch</source></item>
</channel></rss>`,
    newsZh: `<?xml version="1.0"?><rss><channel>
<item><title>字节跳动加大数据标注外包采购，医疗与编程数据需求上升 - 36氪</title><link>https://news.google.com/z1</link><guid>z1</guid><pubDate>${new Date(Date.now() - 3 * 86400_000).toUTCString()}</pubDate><description>字节跳动加大数据标注外包采购</description><source url="https://36kr.com">36氪</source></item>
</channel></rss>`,
    rss: `<?xml version="1.0"?><rss><channel><item><title>The state of post-training data in 2026</title><link>https://www.interconnects.ai/p/post-training-2026</link><guid>i1</guid><pubDate>${new Date(Date.now() - 6 * 86400_000).toUTCString()}</pubDate><description>&lt;p&gt;Labs now spend more on RL environments and expert rubrics than on preference data.&lt;/p&gt;</description></item></channel></rss>`,
  };
}

/** Routes a fetch() call to the fixtures. */
export function fixtureFetch(fx: Fixtures, log: string[] = []) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    log.push(url.href);
    const j = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
    const x = (v: string) => new Response(v, { headers: { "content-type": "application/xml" } });
    const path = decodeURIComponent(url.pathname);
    let m: RegExpMatchArray | null;
    if (url.hostname === "boards-api.greenhouse.io" && (m = path.match(/\/v1\/boards\/([^/]+)\/jobs/))) return fx.gh[m[1]] ? j({ jobs: fx.gh[m[1]] }) : new Response('{"status":404}', { status: 404 });
    if (url.hostname === "api.ashbyhq.com" && (m = path.match(/job-board\/([^/]+)/))) return fx.ashby[m[1]] ? j({ jobs: fx.ashby[m[1]] }) : new Response("not found", { status: 404 });
    if (url.hostname === "api.lever.co" && (m = path.match(/postings\/([^/]+)/))) return fx.lever[m[1]] ? j(fx.lever[m[1]]) : new Response("[]", { status: 404 });
    if (url.hostname === "www.reddit.com" && (m = path.match(/^\/r\/([^/]+)\//))) return j({ data: { children: (fx.reddit[m[1]] ?? []).map((d) => ({ data: d })) } });
    if (url.hostname === "hn.algolia.com") return j({ hits: fx.hn });
    if (url.hostname === "export.arxiv.org") return x(fx.arxiv);
    if (url.hostname === "huggingface.co") return j(fx.hf);
    if (url.hostname === "api.github.com") return j(fx.github);
    if (url.hostname === "news.google.com") return x(url.searchParams.get("hl") === "zh-CN" ? fx.newsZh : fx.news);
    if (url.hostname === "www.interconnects.ai") return x(fx.rss);
    return new Response("blocked in test", { status: 503 });
  };
}
