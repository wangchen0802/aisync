import { BUYERS, CORE_TERMS, FORMAT_DATA_KEYS, VENDORS, type OrgDef } from "@/lib/taxonomy";
import { anyMatch, matchers } from "@/lib/text";

export type TopicRow = { key: string; grp: string; keywords: string[] };
export type Pay = { min: number; max: number; unit: "hr" | "yr" };

export type ClassifyInput = {
  channel: string;
  title: string;
  body: string;
  org?: string;
  orgType?: string;
  isListing?: boolean;
  engagement?: number;
  /** Per-source relevance floor, e.g. worker subreddits where every post matters. */
  base?: number;
  /** Structured compensation text (Ashby / Lever salary ranges) checked before the body. */
  payText?: string;
};

export type Classified = {
  category: "data" | "env" | "eval" | "other";
  intent: string;
  topics: string[];
  buyers: string[];
  vendors: string[];
  relevance: number;
  pay: Pay | null;
  subtype: string;
};

/* ───────── pay ───────── */

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const CUR = String.raw`(?:US\$|USD\s?|\$)`;
// "$45/hr - $100/hr" repeats the unit inside the range, so allow it after the first figure too.
const UNIT_IN = String.raw`(?:\s?(?:\/|per)\s?(?:hour|hr|h)\b)?`;
const MONEY = new RegExp(`${CUR}\\s?${NUM}\\s?([kK])?(${UNIT_IN})(?:\\s?(?:-|–|—|to|~)\\s?(?:${CUR})?\\s?${NUM}\\s?([kK])?)?`, "g");
const HOUR_AFTER = /^\s*(?:USD\s*)?(?:\/\s?(?:hour|hr|h)\b|per\s?(?:hour|hr)\b|an?\s?hour\b|hourly\b|\/\s?hora\b)/i;
const YEAR_AFTER = /^\s*(?:USD\s*)?(?:\/\s?(?:year|yr|annum)\b|per\s?(?:year|annum)\b|a\s?year\b|annual(?:ly)?\b)/i;
const HOUR_NEAR = /hourly|per hour|\/\s?hr\b|an hour|hour rate/i;

const toNum = (s: string, k?: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n * (k ? 1000 : 1) : 0;
};

/** Finds the most useful pay figure: an hourly rate (typical of expert listings) beats an annual salary. */
export function extractPay(text: string): Pay | null {
  let yearly: Pay | null = null;
  for (const m of text.matchAll(MONEY)) {
    const a = toNum(m[1], m[2]);
    const b = m[4] ? toNum(m[4], m[5] ?? m[2]) : a;
    const unitInside = Boolean(m[3]);
    if (!a) continue;
    const end = (m.index ?? 0) + m[0].length;
    const after = text.slice(end, end + 24);
    const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    let unit: Pay["unit"] | null = unitInside || HOUR_AFTER.test(after) ? "hr" : YEAR_AFTER.test(after) ? "yr" : null;
    if (!unit) {
      if (a >= 20000) unit = "yr";
      else if (a <= 1000 && (HOUR_NEAR.test(before) || HOUR_NEAR.test(after))) unit = "hr";
      else continue;
    }
    const min = Math.min(a, b), max = Math.max(a, b);
    if (unit === "hr" && min >= 5 && max <= 2000) return { min, max, unit };
    if (unit === "yr" && min >= 10000 && max <= 5_000_000 && !yearly) yearly = { min, max, unit };
  }
  return yearly;
}

/* ───────── intent ───────── */

const DEMAND_EN = /\b(?:looking for|seeking|searching for|in search of|we need|need(?:ing)? (?:a |an |some )?(?:vendor|provider|partner|supplier|contractor|data ?set|data|environment|annotator|labeler)s?|anyone (?:know|recommend|selling|sells|have)|who (?:sells|provides|offers|builds)|recommend(?:ations)? (?:for )?(?:a )?(?:data |rl )?(?:vendor|provider|company)|buy(?:ing)? (?:data|datasets?|environments?)|want to buy|will(?:ing to)? pay|paying for|in the market for|rfp|request for proposals?|bounty|procure(?:ment)?|sourcing (?:data|experts|annotators)|outsourc(?:e|ing) (?:our )?(?:data|labeling|annotation))\b/i;
const DEMAND_ZH = /求购|采购|需要[^。！？\n]{0,6}(?:数据|环境|标注)|找[^。！？\n]{0,4}(?:供应商|数据|标注|团队)|有没有[^。！？\n]{0,8}(?:数据|供应商|团队|环境)|收[^。！？\n]{0,4}数据|招标|外包|求推荐/;
const SUPPLY = /\b(?:we (?:built|build|offer|provide|launched|are launching|just shipped)|introducing|announcing|now available|launch(?:ed|ing)? (?:our|a|the)|open[- ]sourc(?:ed|ing)|we're excited to)\b|发布|推出|上线|开源/i;
const NEWS = /\b(?:raises?|raised|funding|valuation|valued at|series [a-e]\b|seed round|acquir(?:es|ed|ing)|acquisition|partnership|partners with|signs? (?:a )?deal|contract worth|revenue|\barr\b|layoffs?|lawsuit|sues|sued)\b|融资|估值|收购|营收|裁员/i;
const HIRING = /\b(?:hiring|we're hiring|join (?:us|our team)|apply (?:now|here)|open roles?|job opening|now recruiting|contract role|freelance opportunit|per hour|\/\s?hr)\b|招聘|兼职|时薪/i;

/* ───────── listings ───────── */

/** Staff roles ("Human Data Lead, Expert Programs") are not expert gigs unless the title says contract / hourly. */
const STAFF_TITLE = /\b(?:lead|manager|director|head|vp|engineer|scientist|researcher|recruiter|operations|account|sales|marketing|designer|analyst|counsel|partnerships?)\b/i;
const GIG_TITLE = /\b(?:contract(?:or)?|freelance(?:r)?|hourly|part[- ]time|ai tutor|ai trainer)\b|兼职/i;
const EXPERT_TITLE = /\b(?:experts?|ai trainer|ai tutor|tutors?|trainers?|annotators?|labelers?|raters?|evaluators?|freelance(?:r)?|contractors?|contract|part[- ]time|hourly|fellow(?:ship)?|domain specialist|subject matter|sme|writers?|reviewers?|phd|m\.?d\.?|native speaker|linguist|translator)\b|专家|标注|兼职|测评员/i;
/** Benefits / legal boilerplate in job posts mentions "medical", "vision", "dental"… — keep it out of topic matching. */
const BOILERPLATE = /insurance|benefits|401\s?\(?k|paid time off|\bpto\b|parental leave|equal (?:employment )?opportunity|\beeo\b|visa sponsorship|reasonable accommodation|background check|dental|wellness|stipend|pay transparency|total rewards|privacy (?:notice|policy)/i;

function stripBoilerplate(body: string) {
  return body
    .split(/\n+|(?<=[.!?])\s+/)
    .filter((line) => !BOILERPLATE.test(line))
    .join("\n");
}

function orgsIn(text: string, defs: OrgDef[]) {
  return defs.filter((d) => d.re.test(text)).map((d) => d.key);
}

/* ───────── main ───────── */

const CHANNEL_BASE: Record<string, number> = { jobs: 25, x: 12, reddit: 8, hn: 8, arxiv: 18, hf: 22, github: 12, news: 12, rss: 8, web: 30, manual: 55 };

export function classify(input: ClassifyInput, topics: TopicRow[]): Classified {
  const listing = Boolean(input.isListing);
  const title = input.title || "";
  const body = listing ? stripBoilerplate(input.body || "") : input.body || "";
  const text = `${title}\n${body.slice(0, 8000)}`;

  const matched = topics.filter((t) => matchers(t.keywords).some((r) => r.test(text)));
  const topicKeys = matched.map((t) => t.key);
  const formats = matched.filter((t) => t.grp === "format").length;
  const domains = matched.filter((t) => t.grp === "domain").length;

  const buyers = new Set(orgsIn(text, BUYERS));
  const vendors = new Set(orgsIn(text, VENDORS));
  if (input.org && input.orgType === "lab") buyers.add(input.org);
  if (input.org && (input.orgType === "vendor" || input.orgType === "env")) vendors.add(input.org);

  const subtype = listing ? (EXPERT_TITLE.test(title) && (!STAFF_TITLE.test(title) || GIG_TITLE.test(title)) ? "expert" : "staff") : "";
  const pay = extractPay(input.payText ? `${input.payText}\n${text}` : text);

  let intent = "discussion";
  if (listing) intent = "hiring";
  else if (input.channel === "arxiv") intent = "research";
  else if (input.channel === "hf" || input.channel === "github") intent = "release";
  else if (DEMAND_EN.test(text) || DEMAND_ZH.test(text)) intent = "demand";
  else if (input.channel === "news" || NEWS.test(title)) intent = "news";
  else if (SUPPLY.test(title) || SUPPLY.test(body.slice(0, 400))) intent = "supply";
  else if (HIRING.test(text)) intent = "hiring";

  const has = (k: string) => topicKeys.includes(k);
  const dataFormat = FORMAT_DATA_KEYS.some(has);
  const envish = has("rl_env") || ((has("computer_use") || has("games")) && /\b(?:environment|sandbox|simulator|gym|replica)s?\b|环境/i.test(text));
  const expertListing = listing && subtype === "expert";
  const category: Classified["category"] = envish
    ? "env"
    : has("eval") && !dataFormat && !expertListing
      ? "eval"
      : dataFormat || has("rubric") || (expertListing && input.orgType === "vendor") || anyMatch(text, CORE_TERMS)
        ? "data"
        : "other";

  let r = input.base ?? CHANNEL_BASE[input.channel] ?? 10;
  if (listing && input.orgType === "lab") r += 15;
  if (listing && subtype === "expert") r += 18;
  if (anyMatch(text, CORE_TERMS)) r += 28;
  r += Math.min(formats * 12, 30);
  r += Math.min(domains * 5, 15);
  r += Math.min(buyers.size * 7, 14);
  r += Math.min(vendors.size * 7, 14);
  if (intent === "demand") r += 20;
  if (pay?.unit === "hr") r += 8;
  if (input.engagement && input.engagement > 0) r += Math.min(Math.round(Math.log10(input.engagement + 1) * 4), 10);
  if (category === "other" && !listing) r = Math.min(r, 45);

  return {
    category,
    intent,
    topics: topicKeys,
    buyers: [...buyers],
    vendors: [...vendors],
    relevance: Math.max(0, Math.min(100, Math.round(r))),
    pay,
    subtype,
  };
}
