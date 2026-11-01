import { parseFeed } from "@/lib/feed";
import { htmlToText, isoDate, list, oneLine, sha1 } from "@/lib/text";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type RawItem = {
  id: string;
  url?: string | null;
  title: string;
  body?: string;
  author?: string;
  org?: string;
  location?: string;
  publishedAt?: string | null;
  engagement?: number;
  payText?: string;
  raw?: Record<string, unknown>;
};

export type CollectResult = {
  items: RawItem[];
  state?: Record<string, unknown>;
  /** True when `items` is the full current set (job boards), so missing listings can be marked closed. */
  complete?: boolean;
  /** Page-watch results represent a change of the page itself. */
  pageChange?: boolean;
  note?: string;
};

export type Field = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  type?: "text" | "list" | "select" | "number";
  options?: [string, string][];
  required?: boolean;
};

export type Ctx = { state: Record<string, unknown>; lastOkAt: string | null };

export type CollectorDef = {
  kind: string;
  label: string;
  channel: string;
  listing?: boolean;
  help: string;
  needs?: { env: string; label: string; optional?: boolean }[];
  fields: Field[];
  collect: (config: Record<string, any>, ctx: Ctx) => Promise<CollectResult>;
};

const UA = "DemandRadar/0.1 (+https://github.com/wangchen0802/aisync)";

export class SourceError extends Error {}

async function http(url: string, init: RequestInit = {}, label = "请求"): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "user-agent": UA, accept: "application/json, application/xml;q=0.9, */*;q=0.8", ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch (e) {
    throw new SourceError(`${label}失败：${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " ");
    throw new SourceError(`${label}返回 ${res.status}${body ? `：${body}` : ""}`);
  }
  return res;
}

const getJSON = async (url: string, init?: RequestInit, label?: string) => (await http(url, init, label)).json() as Promise<any>;
const getText = async (url: string, init?: RequestInit, label?: string) => (await http(url, init, label)).text();

const sinceDays = (ctx: Ctx, fallbackDays: number, overlapHours = 36) => {
  const last = ctx.lastOkAt ? new Date(ctx.lastOkAt).getTime() - overlapHours * 3600_000 : Date.now() - fallbackDays * 86400_000;
  return new Date(Math.max(last, Date.now() - fallbackDays * 86400_000));
};

const orgFields: Field[] = [
  { key: "org", label: "公司名", placeholder: "例如 Scale AI", required: true },
  { key: "org_type", label: "类型", type: "select", options: [["vendor", "数据商"], ["lab", "实验室（买方）"], ["env", "RL 环境公司"], ["other", "其他"]] },
];
const filterFields = (titleDefault: boolean): Field[] => [
  { key: "include", label: "只保留包含这些词的", type: "list", placeholder: "human data, post-training, RL environment", help: titleDefault ? "按岗位标题匹配；留空保留全部" : "留空保留全部" },
  { key: "exclude", label: "排除包含这些词的", type: "list", placeholder: "sales, recruiter" },
];

/* ───────── job boards ───────── */

const greenhouse: CollectorDef = {
  kind: "greenhouse",
  label: "Greenhouse 招聘页",
  channel: "jobs",
  listing: true,
  help: "boards.greenhouse.io/<board> 或 job-boards.greenhouse.io/<board> 里的 <board>。每次抓全量，自动识别新增 / 下架 / 薪资变化。",
  fields: [{ key: "board", label: "Board 名", placeholder: "anthropic", required: true }, ...orgFields, ...filterFields(true)],
  async collect(c) {
    const board = String(c.board ?? "").trim();
    const data = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`, undefined, "Greenhouse ");
    const jobs: any[] = data.jobs ?? [];
    return {
      complete: true,
      items: jobs.map((j) => ({
        id: String(j.id),
        url: j.absolute_url,
        title: String(j.title ?? ""),
        body: htmlToText(String(j.content ?? "")),
        location: j.location?.name ?? "",
        publishedAt: isoDate(j.first_published ?? j.updated_at),
        raw: { departments: (j.departments ?? []).map((d: any) => d.name), updated_at: j.updated_at },
      })),
    };
  },
};

const LEVER_INTERVAL: Record<string, string> = { "per-hour-wage": "/hour", "per-year-salary": "per year", "per-month-salary": "per month" };
const lever: CollectorDef = {
  kind: "lever",
  label: "Lever 招聘页",
  channel: "jobs",
  listing: true,
  help: "jobs.lever.co/<company> 里的 <company>。",
  fields: [
    { key: "company", label: "Company 名", placeholder: "mistral", required: true },
    { key: "region", label: "区域", type: "select", options: [["global", "全球（api.lever.co）"], ["eu", "欧洲（api.eu.lever.co）"]] },
    ...orgFields,
    ...filterFields(true),
  ],
  async collect(c) {
    const host = c.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const jobs: any[] = await getJSON(`https://${host}/v0/postings/${encodeURIComponent(String(c.company ?? "").trim())}?mode=json`, undefined, "Lever ");
    return {
      complete: true,
      items: jobs.map((j) => {
        const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(String(l.content ?? ""))}`).join("\n");
        const s = j.salaryRange;
        const payText = s && s.min ? `$${s.min} - $${s.max ?? s.min} ${LEVER_INTERVAL[s.interval] ?? ""}`.trim() : undefined;
        return {
          id: String(j.id),
          url: j.hostedUrl,
          title: String(j.text ?? ""),
          body: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n"),
          location: j.categories?.location ?? "",
          publishedAt: isoDate(j.createdAt),
          payText,
          raw: { team: j.categories?.team, commitment: j.categories?.commitment, workplace: j.workplaceType },
        };
      }),
    };
  },
};

const ashby: CollectorDef = {
  kind: "ashby",
  label: "Ashby 招聘页",
  channel: "jobs",
  listing: true,
  help: "jobs.ashbyhq.com/<board> 里的 <board>。带薪资区间。",
  fields: [{ key: "board", label: "Board 名", placeholder: "openai", required: true }, ...orgFields, ...filterFields(true)],
  async collect(c) {
    const data = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(String(c.board ?? "").trim())}?includeCompensation=true`, undefined, "Ashby ");
    const jobs: any[] = (data.jobs ?? []).filter((j: any) => j.isListed !== false);
    return {
      complete: true,
      items: jobs.map((j) => ({
        id: String(j.id),
        url: j.jobUrl ?? j.applyUrl,
        title: String(j.title ?? ""),
        body: String(j.descriptionPlain ?? htmlToText(String(j.descriptionHtml ?? ""))),
        location: j.location ?? "",
        publishedAt: isoDate(j.publishedAt),
        payText: j.compensation?.compensationTierSummary ?? j.compensation?.scrapeableCompensationSalarySummary ?? undefined,
        raw: { department: j.department, team: j.team, employmentType: j.employmentType, remote: j.isRemote },
      })),
    };
  },
};

/* ───────── social ───────── */

const g = globalThis as unknown as { __redditToken?: { token: string; exp: number } };
async function redditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (g.__redditToken && g.__redditToken.exp > Date.now() + 60_000) return g.__redditToken.token;
  const data = await getJSON(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    },
    "Reddit 授权",
  );
  if (!data.access_token) throw new SourceError(`Reddit 授权失败：${data.error ?? "没有返回 token"}`);
  g.__redditToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

const reddit: CollectorDef = {
  kind: "reddit",
  label: "Reddit 版块",
  channel: "reddit",
  help: "版块最新帖子，或版块内搜索。多个版块用 + 连接，例如 outlier_ai+DataAnnotationTech。",
  needs: [{ env: "REDDIT_CLIENT_ID", label: "Reddit app（强烈建议，云服务器的匿名请求经常被拒）", optional: true }],
  fields: [
    { key: "subreddit", label: "版块", placeholder: "outlier_ai", required: true },
    { key: "query", label: "搜索词（可选）", placeholder: '"rl environment" OR "training data"', help: "留空 = 抓最新帖子" },
    { key: "base", label: "基础相关度", type: "number", placeholder: "8", help: "标注员 / 专家社区可以设 30：这里的每条帖子都和需求有关" },
  ],
  async collect(c) {
    const token = await redditToken();
    const sub = String(c.subreddit ?? "").replace(/^\/?r\//, "").trim();
    const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
    const ext = token ? "" : ".json";
    const qs = c.query
      ? `/r/${sub}/search${ext}?q=${encodeURIComponent(String(c.query))}&restrict_sr=1&sort=new&t=month&limit=50&raw_json=1`
      : `/r/${sub}/new${ext}?limit=50&raw_json=1`;
    let data: any;
    try {
      data = await getJSON(base + qs, token ? { headers: { authorization: `Bearer ${token}` } } : undefined, "Reddit ");
    } catch (e) {
      if (!token && /返回 (403|429)/.test((e as Error).message)) {
        throw new SourceError(`${(e as Error).message.slice(0, 40)}… Reddit 拒绝了匿名请求：在 reddit.com/prefs/apps 建一个 script app，把 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET 配到环境变量`);
      }
      throw e;
    }
    const posts: any[] = (data.data?.children ?? []).map((ch: any) => ch.data).filter((p: any) => p && !p.stickied);
    return {
      items: posts.map((p) => ({
        id: String(p.name ?? p.id),
        url: `https://www.reddit.com${p.permalink}`,
        title: String(p.title ?? ""),
        body: [String(p.selftext ?? ""), p.url && !String(p.url).includes(p.permalink) ? p.url : ""].filter(Boolean).join("\n"),
        author: p.author ? `u/${p.author}` : "",
        org: `r/${p.subreddit}`,
        publishedAt: isoDate(p.created_utc),
        engagement: (p.score ?? 0) + (p.num_comments ?? 0),
        raw: { subreddit: p.subreddit, flair: p.link_flair_text ?? null },
      })),
    };
  },
};

const hn: CollectorDef = {
  kind: "hn",
  label: "Hacker News 搜索",
  channel: "hn",
  help: "通过 Algolia 搜索 HN 的帖子和评论（包括每月 Who is hiring）。多个搜索词用逗号分隔。",
  fields: [
    { key: "query", label: "搜索词", type: "list", placeholder: '"rl environments", "training data" vendor', required: true },
    { key: "tags", label: "范围", type: "select", options: [["story", "只看帖子"], ["all", "帖子 + 评论"]] },
  ],
  async collect(c, ctx) {
    const since = Math.floor(sinceDays(ctx, 30).getTime() / 1000);
    const tags = c.tags === "all" ? "(story,comment)" : "story";
    const out = new Map<string, RawItem>();
    for (const query of list(c.query).slice(0, 6)) {
      const data = await getJSON(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=${encodeURIComponent(tags)}&hitsPerPage=50&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`,
        undefined,
        "HN ",
      );
      for (const h of data.hits ?? []) {
        const isComment = !h.title;
        out.set(String(h.objectID), {
          id: String(h.objectID),
          url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          title: isComment ? `评论 · ${h.story_title ?? ""}` : String(h.title),
          body: [htmlToText(String(h.story_text ?? h.comment_text ?? "")), h.url ?? ""].filter(Boolean).join("\n"),
          author: h.author ?? "",
          publishedAt: isoDate(h.created_at),
          engagement: (h.points ?? 0) + (h.num_comments ?? 0),
        });
      }
    }
    return { items: [...out.values()] };
  },
};

const x: CollectorDef = {
  kind: "x",
  label: "X 搜索",
  channel: "x",
  help: "X API v2 最近 7 天搜索。支持 X 搜索语法，例如 (from:alexandr_wang OR from:mercor_ai) 或 \"rl environments\" lang:en。自动去掉转推。",
  needs: [{ env: "X_BEARER_TOKEN", label: "X API Bearer Token" }],
  fields: [{ key: "query", label: "搜索语句", placeholder: '"RL environments" OR "rl envs" -is:reply', required: true }],
  async collect(c, ctx) {
    const token = process.env.X_BEARER_TOKEN;
    if (!token) throw new SourceError("没有配置 X_BEARER_TOKEN。没有 X API 时，可以用「收录」书签把看到的帖子一键收进来");
    const query = `${String(c.query ?? "").trim()}${/is:retweet/.test(String(c.query)) ? "" : " -is:retweet"}`;
    const params = new URLSearchParams({
      query,
      max_results: "100",
      "tweet.fields": "created_at,public_metrics,author_id,lang,note_tweet",
      expansions: "author_id",
      "user.fields": "username,name,description",
    });
    if (typeof ctx.state.since_id === "string") params.set("since_id", ctx.state.since_id);
    const data = await getJSON(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { authorization: `Bearer ${token}` } }, "X ");
    const users = new Map<string, any>((data.includes?.users ?? []).map((u: any) => [u.id, u]));
    const tweets: any[] = data.data ?? [];
    return {
      state: data.meta?.newest_id ? { since_id: data.meta.newest_id } : ctx.state,
      items: tweets.map((t) => {
        const u = users.get(t.author_id);
        const m = t.public_metrics ?? {};
        return {
          id: String(t.id),
          url: `https://x.com/${u?.username ?? "i"}/status/${t.id}`,
          title: "",
          body: String(t.note_tweet?.text ?? t.text ?? ""),
          author: u ? `@${u.username}` : "",
          org: u?.name ?? "",
          publishedAt: isoDate(t.created_at),
          engagement: (m.like_count ?? 0) + 2 * (m.retweet_count ?? 0) + (m.reply_count ?? 0) + (m.quote_count ?? 0),
          raw: { bio: u?.description ?? "", lang: t.lang },
        };
      }),
    };
  },
};

/* ───────── research & releases ───────── */

const arxiv: CollectorDef = {
  kind: "arxiv",
  label: "arXiv 论文",
  channel: "arxiv",
  help: "arXiv API 查询语法：abs:\"RL environment\" OR ti:benchmark，可以加 AND cat:cs.LG。",
  fields: [{ key: "query", label: "查询", placeholder: 'abs:"RL environments" OR abs:"agentic environments"', required: true }],
  async collect(c) {
    const xml = await getText(
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(String(c.query ?? ""))}&sortBy=submittedDate&sortOrder=descending&max_results=50`,
      undefined,
      "arXiv ",
    );
    return {
      items: parseFeed(xml).map((e) => ({
        id: e.id.replace(/v\d+$/, ""),
        url: e.link || e.id,
        title: e.title,
        body: e.summary,
        author: e.author,
        publishedAt: isoDate(e.published),
      })),
    };
  },
};

const HF_PATH: Record<string, string> = { datasets: "datasets/", spaces: "spaces/", models: "" };
const hf: CollectorDef = {
  kind: "hf",
  label: "Hugging Face",
  channel: "hf",
  help: "新发布的数据集 / Space / 模型。可以按关键词，或盯某个组织（例如 openai、allenai、PrimeIntellect）。",
  fields: [
    { key: "what", label: "类型", type: "select", options: [["datasets", "数据集"], ["spaces", "Spaces"], ["models", "模型"]] },
    { key: "search", label: "关键词", placeholder: "rl environment" },
    { key: "author", label: "组织 / 作者", placeholder: "PrimeIntellect" },
  ],
  async collect(c) {
    const what = HF_PATH[c.what] !== undefined ? String(c.what) : "datasets";
    const params = new URLSearchParams({ sort: "createdAt", direction: "-1", limit: "50", full: "true" });
    if (c.search) params.set("search", String(c.search));
    if (c.author) params.set("author", String(c.author));
    let rows: any[];
    try {
      rows = await getJSON(`https://huggingface.co/api/${what}?${params}`, undefined, "Hugging Face ");
    } catch (e) {
      if (!/返回 400/.test((e as Error).message)) throw e;
      params.set("sort", "lastModified");
      rows = await getJSON(`https://huggingface.co/api/${what}?${params}`, undefined, "Hugging Face ");
    }
    return {
      items: rows.map((d) => {
        const tags = (d.tags ?? []).filter((t: string) => /^(task_categories|task_ids|language|modality|format):/.test(t) || !t.includes(":"));
        return {
          id: String(d.id),
          url: `https://huggingface.co/${HF_PATH[what]}${d.id}`,
          title: String(d.id),
          body: [d.description ?? d.cardData?.pretty_name ?? "", tags.slice(0, 20).join(" · ")].filter(Boolean).join("\n"),
          author: d.author ?? String(d.id).split("/")[0],
          publishedAt: isoDate(d.createdAt ?? d.lastModified),
          engagement: (d.likes ?? 0) + Math.round((d.downloads ?? 0) / 100),
        };
      }),
    };
  },
};

const github: CollectorDef = {
  kind: "github",
  label: "GitHub 新仓库",
  channel: "github",
  help: "GitHub 仓库搜索，自动只看最近 30 天新建的。语法同 GitHub 搜索。",
  needs: [{ env: "GITHUB_TOKEN", label: "GitHub token（可选，提高限额）", optional: true }],
  fields: [{ key: "query", label: "搜索语句", placeholder: "rl environment in:name,description,readme", required: true }],
  async collect(c, ctx) {
    let query = String(c.query ?? "").trim();
    if (!/\b(created|pushed):/.test(query)) query += ` created:>${sinceDays(ctx, 30, 72).toISOString().slice(0, 10)}`;
    const headers: Record<string, string> = { accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const data = await getJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=50`, { headers }, "GitHub ");
    return {
      items: (data.items ?? []).map((r: any) => ({
        id: String(r.id),
        url: r.html_url,
        title: String(r.full_name),
        body: [r.description ?? "", (r.topics ?? []).join(" · ")].filter(Boolean).join("\n"),
        author: r.owner?.login ?? "",
        publishedAt: isoDate(r.created_at),
        engagement: (r.stargazers_count ?? 0) + (r.forks_count ?? 0),
      })),
    };
  },
};

/* ───────── news, blogs, pages ───────── */

const news: CollectorDef = {
  kind: "news",
  label: "新闻搜索",
  channel: "news",
  help: "Google News 搜索（最近 7 天）：融资、合同、数据授权、裁员……支持 OR、引号和 -排除词。",
  fields: [
    { key: "query", label: "搜索语句", placeholder: '"Scale AI" OR Mercor OR "Surge AI" funding', required: true },
    { key: "lang", label: "语言", type: "select", options: [["en", "英文"], ["zh", "中文"]] },
  ],
  async collect(c) {
    const q = String(c.query ?? "").trim();
    const loc = c.lang === "zh" ? "hl=zh-CN&gl=CN&ceid=CN:zh-Hans" : "hl=en-US&gl=US&ceid=US:en";
    const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(/\bwhen:\d/.test(q) ? q : `${q} when:7d`)}&${loc}`, undefined, "新闻 ");
    return {
      items: parseFeed(xml).map((e) => {
        const publisher = e.source || e.title.match(/ - ([^-]+)$/)?.[1] || "";
        return {
          id: e.id || e.link,
          url: e.link,
          title: publisher ? e.title.replace(new RegExp(` - ${publisher.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : e.title,
          body: e.summary === e.title ? "" : e.summary,
          author: publisher,
          publishedAt: isoDate(e.published),
        };
      }),
    };
  },
};

const rss: CollectorDef = {
  kind: "rss",
  label: "RSS / 博客",
  channel: "rss",
  help: "任意 RSS / Atom：公司博客、Substack（地址后加 /feed）、播客、公众号转 RSS 服务。",
  fields: [{ key: "url", label: "Feed 地址", placeholder: "https://www.interconnects.ai/feed", required: true }, ...orgFields.map((f) => ({ ...f, required: false })), ...filterFields(false)],
  async collect(c) {
    const xml = await getText(String(c.url ?? ""), undefined, "Feed ");
    return {
      items: parseFeed(xml).slice(0, 60).map((e) => ({
        id: e.id || e.link || sha1(e.title),
        url: e.link,
        title: e.title,
        body: e.summary.slice(0, 8000),
        author: e.author,
        publishedAt: isoDate(e.published),
      })),
    };
  },
};

const page: CollectorDef = {
  kind: "page",
  label: "网页变化监控",
  channel: "web",
  help: "定期抓取一个页面，正文有新增内容时生成一条「页面更新」信号（第一次抓取只建基线）。适合没有 API 的招聘页、价格页、产品页。需要 JS 渲染的页面可能抓不到内容。",
  fields: [
    { key: "url", label: "页面地址", placeholder: "https://example.com/careers", required: true },
    ...orgFields.map((f) => ({ ...f, required: false })),
    { key: "include", label: "只关心包含这些词的行", type: "list", placeholder: "expert, environment, $" },
  ],
  async collect(c, ctx) {
    const url = String(c.url ?? "").trim();
    const html = await getText(url, { headers: { accept: "text/html,application/xhtml+xml" } }, "页面 ");
    const inc = list(c.include);
    let lines = htmlToText(html).split("\n").map(oneLine).filter((l) => l.length > 2);
    if (inc.length) lines = lines.filter((l) => inc.some((k) => l.toLowerCase().includes(k.toLowerCase())));
    lines = [...new Set(lines)].slice(0, 600);
    const hash = sha1(lines.join("\n"));
    const prev = Array.isArray(ctx.state.lines) ? (ctx.state.lines as string[]) : null;
    const state = { hash, lines };
    if (!lines.length) return { items: [], state, note: "页面没有可读文字（可能需要 JS 渲染）" };
    if (!prev) return { items: [], state, note: `已建立基线（${lines.length} 行）` };
    if (ctx.state.hash === hash) return { items: [], state };
    const before = new Set(prev);
    const added = lines.filter((l) => !before.has(l));
    const after = new Set(lines);
    const removed = prev.filter((l) => !after.has(l));
    if (!added.length && !removed.length) return { items: [], state };
    const body = [
      added.length ? `新增：\n${added.slice(0, 60).map((l) => `+ ${l}`).join("\n")}` : "",
      removed.length ? `删除：\n${removed.slice(0, 30).map((l) => `- ${l}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    return {
      pageChange: true,
      state,
      items: [{ id: hash.slice(0, 20), url, title: `页面更新：新增 ${added.length} 行，删除 ${removed.length} 行`, body, publishedAt: new Date().toISOString(), raw: { added: added.length, removed: removed.length } }],
    };
  },
};

export const COLLECTORS: Record<string, CollectorDef> = Object.fromEntries(
  [greenhouse, ashby, lever, x, reddit, hn, news, rss, arxiv, hf, github, page].map((c) => [c.kind, c]),
);

export function missingEnv(def: CollectorDef): string[] {
  return (def.needs ?? []).filter((n) => !n.optional && !process.env[n.env]).map((n) => n.env);
}
