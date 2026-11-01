import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { q } from "@/lib/db";
import { clip } from "@/lib/text";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
// Server-side fallback: if the model declines a request, the API retries it on a suitable model in the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let _client: Anthropic | null = null;
function client() {
  if (!_client) _client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return _client;
}

/* ───────── batch classification ───────── */

const INTENTS = ["demand", "hiring", "supply", "release", "research", "news", "discussion"] as const;

const ItemSchema = z.object({
  id: z.number().int(),
  relevance: z.number().int().describe("0–100：这条信息对判断「AI 实验室现在需要什么训练数据 / RL 环境、愿意花多少钱」有多大价值。纯招聘广告、与 AI 数据无关的内容给低分"),
  category: z.enum(["data", "env", "eval", "other"]).describe("data=训练数据（标注、专家数据、SFT、偏好、轨迹、预训练语料）；env=RL 环境 / 仿真 / 沙箱 / verifier；eval=评测与基准；other=都不是"),
  intent: z.enum(INTENTS).describe("demand=有人明确在找数据/环境/供应商；hiring=招专家、标注员、环境工程师；supply=供应商推广自己；release=开源发布；research=论文；news=融资/合作/合同；discussion=其他讨论"),
  topics: z.array(z.string()).describe("从给定的 topic key 中选，最多 5 个，只选确实相关的"),
  buyers: z.array(z.string()).describe("涉及的模型公司 / 实验室（买方），用常见英文名，如 OpenAI、Anthropic、Google DeepMind、Meta、xAI、ByteDance"),
  vendors: z.array(z.string()).describe("涉及的数据商 / RL 环境公司（供给方），如 Scale AI、Mercor、Surge AI"),
  summary: z.string().describe("一句中文摘要，≤60 字：谁需要 / 提供什么数据或环境、什么领域、什么价格或规模。不要复述标题"),
});
const BatchSchema = z.object({ items: z.array(ItemSchema) });

const CLASSIFY_SYSTEM = `你是一家 AI 训练数据 / RL 环境公司的市场情报分析师。你会收到一批从岗位、X、Reddit、HN、论文、新闻等渠道抓来的信息。
对每一条判断：它透露了什么「需求」——哪些实验室在买什么类型的数据或环境、什么领域、什么价位、需求在变多还是变少。
- 数据商（Scale、Mercor、Surge 等）发布的专家岗位，说明它们接到了对应领域的实验室订单：relevance 高，intent=hiring。
- 实验室自己招 Human Data / RL Environments / Post-training 岗位：说明内部投入在加大，relevance 高。
- 有人公开说「在找 / 需要 / 愿意付费」的，intent=demand，relevance 最高。
- 标注员社区里「没活了 / 项目暂停 / 时薪下降」也是需求变化信号，relevance 中高，summary 里写清楚方向。
- 和 AI 训练数据、RL 环境、评测无关的（普通销售岗、泛泛的 AI 新闻），relevance ≤ 20。
每条都要返回，id 原样带回。`;

type Pending = { id: number; channel: string; title: string; body: string; org: string; org_type: string; is_listing: boolean; pay_min: number | null; pay_max: number | null; pay_unit: string | null; author: string };

/** Re-classifies recent rule-tagged signals with Claude. Returns how many were updated. */
export async function classifyPending(budgetMs = 60_000, max = 160): Promise<{ done: number; error?: string }> {
  if (!aiEnabled()) return { done: 0 };
  const started = Date.now();
  const topics = await q<{ key: string; label: string }>("select key, label from rd_topics where not archived order by sort");
  const keys = new Set(topics.map((t) => t.key));
  const topicList = topics.map((t) => `${t.key}（${t.label}）`).join("、");
  const pending = await q<Pending>(
    `select id, channel, title, left(body, 1800) as body, org, org_type, is_listing, pay_min, pay_max, pay_unit, author
     from rd_signals where engine = 'rules' and not dismissed and relevance >= 15 and first_seen_at > now() - interval '21 days'
     order by relevance desc, first_seen_at desc limit $1`,
    [max],
  );
  let done = 0;
  for (let i = 0; i < pending.length && Date.now() - started < budgetMs; i += 20) {
    const batch = pending.slice(i, i + 20);
    const docs = batch
      .map((s) => {
        const pay = s.pay_min != null ? ` · 薪资 $${s.pay_min}${s.pay_max && s.pay_max !== s.pay_min ? `–${s.pay_max}` : ""}/${s.pay_unit === "hr" ? "小时" : "年"}` : "";
        const who = [s.org && `${s.org}${s.org_type ? `(${s.org_type})` : ""}`, s.author].filter(Boolean).join(" · ");
        return `<item id="${s.id}" channel="${s.channel}"${s.is_listing ? ' listing="yes"' : ""}>\n${who ? `来源：${who}${pay}\n` : pay ? `${pay}\n` : ""}标题：${s.title}\n${clip(s.body, 1800)}\n</item>`;
      })
      .join("\n\n");
    try {
      const res = await client().beta.messages.parse({
        model: MODEL(),
        max_tokens: 16000,
        ...FALLBACK,
        output_config: { effort: "low", format: betaZodOutputFormat(BatchSchema) },
        system: CLASSIFY_SYSTEM,
        messages: [{ role: "user", content: `可选 topic key：${topicList}\n\n${docs}` }],
      });
      if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`AI 分类失败（${res.stop_reason}）`);
      for (const it of res.parsed_output.items) {
        if (!batch.some((b) => b.id === it.id)) continue;
        await q(
          `update rd_signals set relevance = $2, category = $3, intent = case when is_listing then 'hiring' else $4 end, topics = $5,
             buyers = $6, vendors = $7, summary = $8, engine = 'ai' where id = $1`,
          [
            it.id, Math.max(0, Math.min(100, Math.round(it.relevance))), it.category, it.intent,
            it.topics.filter((t) => keys.has(t)).slice(0, 5), it.buyers.slice(0, 8), it.vendors.slice(0, 8), clip(it.summary, 200),
          ],
        );
        done++;
      }
    } catch (e) {
      return { done, error: e instanceof Anthropic.APIError ? `Claude API ${e.status}：${e.message}` : (e as Error).message };
    }
  }
  return { done };
}

/* ───────── weekly brief ───────── */

const BRIEF_SYSTEM = `你是 AI 训练数据 / RL 环境公司的市场情报负责人，给创始团队写每周「需求雷达」简报。
读者要据此决定：下周找哪些客户、做哪类数据或环境、怎么定价。要求：
- 中文，Markdown。结构：## 一句话结论 → ## 需求在变多的方向 → ## 买方动向（实验室） → ## 供给方动向（数据商 / 环境公司） → ## 岗位与价格 → ## 建议下周行动（3–5 条，具体到找谁、做什么）。
- 每个判断后面用 [#编号] 标出依据的信号编号，没有依据的不要写。
- 区分「事实」和「推测」，推测要写明。数据少就直说数据少，不要编。
- 简洁：总长度不超过 900 字。`;

export async function writeBriefWithAI(context: string): Promise<string> {
  const res = await client().beta.messages.create({
    model: MODEL(),
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium" },
    system: BRIEF_SYSTEM,
    messages: [{ role: "user", content: context }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI 拒绝了这次请求");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  if (!text) throw new Error(`AI 没有返回内容（${res.stop_reason}）`);
  return text;
}

export const ANALYZE_PROMPT = `下面是我们「需求雷达」最近收集到的信号和统计（数据 / RL 环境需求）。请像市场情报负责人一样分析：
1）哪些需求方向在变多、哪些在变少，依据是什么；2）哪些实验室在买什么；3）数据商岗位和时薪透露了什么；4）我们下周最该做的 3–5 件事。
每个判断标出依据的信号编号 [#编号]，区分事实和推测。`;
