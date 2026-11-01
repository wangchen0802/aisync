/**
 * Channel presets (one-click sources) and the wider channel map the team brainstorms on.
 * `seed: true` presets are created on a fresh database.
 */

export type Preset = {
  id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  every_hours?: number;
  seed?: boolean;
  /** Board slugs we could not verify from here — the UI asks to "试运行" before adding. */
  verify?: boolean;
  why: string;
};

/** Lab job boards are huge; keep only roles that reveal data / environment demand (matched on the title). */
export const LAB_ROLE_FILTER = [
  "human data", "data operations", "data partnerships", "data partnership", "data acquisition", "data strategy", "data programs",
  "data quality", "data lead", "post-training", "post training", "rl environment", "environments", "reinforcement learning", "rlhf",
  "reward", "evaluation", "evals", "annotation", "ai tutor", "ai trainer", "expert", "training data", "synthetic data", "data sourcing",
];

const lab = (org: string) => ({ org, org_type: "lab", include: LAB_ROLE_FILTER });
const vendor = (org: string) => ({ org, org_type: "vendor" });

export const PRESETS: Preset[] = [
  /* lab job boards: which data / environment teams are growing */
  { id: "gh-anthropic", kind: "greenhouse", name: "Anthropic 数据 / 环境岗位", config: { board: "anthropic", ...lab("Anthropic") }, seed: true, why: "Human Data、RL Environments、Post-training 团队招人 = 内部需求在扩张" },
  { id: "ab-openai", kind: "ashby", name: "OpenAI 数据 / 环境岗位", config: { board: "openai", ...lab("OpenAI") }, seed: true, why: "Human Data / Post-training / Evals 岗位变化" },
  { id: "gh-deepmind", kind: "greenhouse", name: "Google DeepMind 数据 / 环境岗位", config: { board: "deepmind", ...lab("Google DeepMind") }, seed: true, why: "Gemini 后训练、数据合作岗位" },
  { id: "gh-xai", kind: "greenhouse", name: "xAI 数据 / 环境岗位", config: { board: "xai", ...lab("xAI") }, seed: true, why: "xAI 自建 AI Tutor 团队，岗位本身就是专家数据需求" },
  { id: "lv-mistral", kind: "lever", name: "Mistral 数据 / 环境岗位", config: { company: "mistral", ...lab("Mistral") }, seed: true, why: "欧洲实验室的数据需求" },
  { id: "ab-cohere", kind: "ashby", name: "Cohere 数据 / 环境岗位", config: { board: "cohere", ...lab("Cohere") }, verify: true, why: "企业模型公司：企业工作流数据 / 环境" },
  { id: "ab-perplexity", kind: "ashby", name: "Perplexity 数据岗位", config: { board: "perplexity", ...lab("Perplexity") }, verify: true, why: "搜索 / Agent 数据" },
  { id: "gh-thinkingmachines", kind: "greenhouse", name: "Thinking Machines 数据岗位", config: { board: "thinkingmachines", ...lab("Thinking Machines") }, verify: true, why: "新实验室，后训练团队" },

  /* vendor boards: expert listings are the closest proxy of what labs are buying right now */
  { id: "gh-scale", kind: "greenhouse", name: "Scale AI 岗位", config: { board: "scaleai", ...vendor("Scale AI") }, seed: true, why: "最大的数据商；专家岗位 / 新项目方向" },
  { id: "ab-mercor", kind: "ashby", name: "Mercor 岗位", config: { board: "mercor", ...vendor("Mercor") }, verify: true, why: "专家网络；岗位领域和时薪直接反映实验室采购" },
  { id: "gh-snorkel", kind: "greenhouse", name: "Snorkel AI 岗位", config: { board: "snorkelai", ...vendor("Snorkel AI") }, verify: true, why: "Expert data-as-a-service" },
  { id: "gh-labelbox", kind: "greenhouse", name: "Labelbox / Alignerr 岗位", config: { board: "labelbox", ...vendor("Labelbox") }, verify: true, why: "Alignerr 专家网络" },
  { id: "gh-handshake", kind: "greenhouse", name: "Handshake AI 岗位", config: { board: "handshake", ...vendor("Handshake AI") }, verify: true, why: "学生 / 博士专家供给" },
  { id: "gh-turing", kind: "greenhouse", name: "Turing 岗位", config: { board: "turing", ...vendor("Turing") }, verify: true, why: "编程 / Agent 数据" },
  { id: "ab-invisible", kind: "ashby", name: "Invisible 岗位", config: { board: "invisible", ...vendor("Invisible") }, verify: true, why: "RLHF / 专家数据" },
  { id: "ab-micro1", kind: "ashby", name: "micro1 岗位", config: { board: "micro1", ...vendor("micro1") }, verify: true, why: "AI 招聘 + 专家数据" },
  { id: "ab-prime", kind: "ashby", name: "Prime Intellect 岗位", config: { board: "PrimeIntellect", org: "Prime Intellect", org_type: "env" }, verify: true, why: "Environments Hub：开源 RL 环境生态" },

  /* social */
  { id: "rd-workers", kind: "reddit", name: "Reddit · 标注员 / 专家社区", config: { subreddit: "outlier_ai+DataAnnotationTech", base: 30 }, every_hours: 12, seed: true, why: "项目多了还是没活了、时薪涨跌、新项目领域——一线供给侧体感" },
  { id: "rd-ml", kind: "reddit", name: "Reddit · ML 社区讨论", config: { subreddit: "MachineLearning+LocalLLaMA+reinforcementlearning", query: '"rl environment" OR "rl environments" OR "training data" OR "data vendor" OR rlhf' }, seed: true, why: "研究者 / 开发者在找什么数据和环境" },
  { id: "hn-core", kind: "hn", name: "Hacker News · 数据与环境", config: { query: ['"rl environments"', '"training data" vendor', '"human data"', '"data labeling"', '"post-training"'], tags: "all" }, seed: true, why: "创业公司发布、招聘帖、业内讨论" },
  { id: "x-envs", kind: "x", name: "X · RL 环境讨论", config: { query: '("RL environments" OR "RL envs" OR "rl environment") -is:reply' }, every_hours: 6, seed: true, why: "实验室研究员 / 创始人在 X 上谈需求" },
  { id: "x-data", kind: "x", name: "X · 训练数据需求", config: { query: '("human data" OR "expert data" OR "training data vendor" OR "post-training data") -is:reply' }, every_hours: 6, seed: true, why: "需求、吐槽、供应商推广" },

  /* research & open source */
  { id: "ax-envs", kind: "arxiv", name: "arXiv · RL 环境 / 可验证奖励", config: { query: 'abs:"RL environments" OR abs:"reinforcement learning environments" OR abs:"agentic environments" OR abs:"verifiable rewards"' }, seed: true, why: "研究在用什么环境、缺什么环境" },
  { id: "ax-data", kind: "arxiv", name: "arXiv · 后训练数据", config: { query: '(abs:"preference data" OR abs:"human feedback" OR abs:"synthetic data" OR abs:"expert annotations") AND cat:cs.CL' }, seed: true, why: "后训练数据的方法和缺口" },
  { id: "hf-env", kind: "hf", name: "HF · 环境相关数据集", config: { what: "datasets", search: "environment" }, seed: true, why: "开源环境 / 轨迹数据集" },
  { id: "hf-openai", kind: "hf", name: "HF · OpenAI 发布", config: { what: "datasets", author: "openai" }, why: "实验室开源的评测 / 数据集说明它在意的能力" },
  { id: "hf-nvidia", kind: "hf", name: "HF · NVIDIA 发布", config: { what: "datasets", author: "nvidia" }, why: "NVIDIA 大量开放后训练数据" },
  { id: "hf-allenai", kind: "hf", name: "HF · Ai2 发布", config: { what: "datasets", author: "allenai" }, why: "Tulu / OLMo 后训练配方" },
  { id: "gh-envs", kind: "github", name: "GitHub · 新 RL 环境仓库", config: { query: "rl environment in:name,description,readme" }, seed: true, why: "新环境框架、gym、benchmark" },

  /* money & deals */
  { id: "nw-vendors", kind: "news", name: "新闻 · 数据商动态", config: { query: '"Scale AI" OR Mercor OR "Surge AI" OR "Handshake AI" OR micro1 OR "Invisible Technologies" OR "Snorkel AI" OR Turing AI data', lang: "en" }, seed: true, why: "融资、合同、客户变化" },
  { id: "nw-envs", kind: "news", name: "新闻 · RL 环境 / 数据交易", config: { query: '"RL environments" OR "reinforcement learning environments" OR "training data deal" OR "data licensing" AI', lang: "en" }, seed: true, why: "RL 环境创业公司、数据授权交易" },
  { id: "nw-zh", kind: "news", name: "新闻 · 中文数据产业", config: { query: "数据标注 OR 训练数据 OR 强化学习环境 OR 数据供应商 大模型", lang: "zh" }, seed: true, why: "国内实验室和数据商动态" },

  /* newsletters */
  { id: "rss-interconnects", kind: "rss", name: "Interconnects（Nathan Lambert）", config: { url: "https://www.interconnects.ai/feed" }, seed: true, why: "后训练一线观察" },
  { id: "rss-latentspace", kind: "rss", name: "Latent Space", config: { url: "https://www.latent.space/feed" }, why: "AI 工程 / 创始人访谈" },
  { id: "rss-importai", kind: "rss", name: "Import AI（Jack Clark）", config: { url: "https://importai.substack.com/feed" }, why: "每周研究综述" },
];

export type ChannelIdea = {
  title: string;
  status: "auto" | "key" | "manual" | "idea";
  how: string;
  presets?: string[];
};
export type ChannelGroup = { title: string; why: string; ideas: ChannelIdea[] };

export const STATUS_LABEL: Record<ChannelIdea["status"], string> = { auto: "自动", key: "需要 Key", manual: "手动收录", idea: "待讨论" };

export const CHANNEL_MAP: ChannelGroup[] = [
  {
    title: "数据商专家岗位",
    why: "数据商接到实验室订单后才会招对应领域的专家：岗位的领域、数量、时薪是最接近「实验室在买什么」的公开信号。",
    ideas: [
      { title: "Scale AI / Outlier", status: "auto", how: "Greenhouse 全量岗位；Outlier 专家页可用网页监控", presets: ["gh-scale"] },
      { title: "Mercor", status: "auto", how: "Ashby 公司岗位；work.mercor.com 专家岗位是 JS 页面，先用收录书签", presets: ["ab-mercor"] },
      { title: "Snorkel、Labelbox / Alignerr、Handshake AI、Turing、Invisible、micro1", status: "auto", how: "招聘页预设（先试运行确认 board 名）", presets: ["gh-snorkel", "gh-labelbox", "gh-handshake", "gh-turing", "ab-invisible", "ab-micro1"] },
      { title: "Surge AI / DataAnnotation、Toloka / Mindrift、Prolific、Appen、TELUS Digital", status: "manual", how: "没有公开 API：网页变化监控 + Reddit 社区 + 收录书签" },
      { title: "国内：海天瑞声、数据堂、标贝、云测、整数智能", status: "manual", how: "Boss 直聘 / 官网招聘：收录书签；或网页监控" },
    ],
  },
  {
    title: "实验室自己的岗位",
    why: "Human Data、RL Environments、Post-training、Evals 团队在扩张，说明实验室在加大投入（也说明它可能自建、不外采）。",
    ideas: [
      { title: "Anthropic、OpenAI、Google DeepMind、xAI、Mistral", status: "auto", how: "已接入，按岗位标题过滤数据 / 环境相关", presets: ["gh-anthropic", "ab-openai", "gh-deepmind", "gh-xai", "lv-mistral"] },
      { title: "Cohere、Perplexity、Thinking Machines、Prime Intellect", status: "auto", how: "预设，试运行后添加", presets: ["ab-cohere", "ab-perplexity", "gh-thinkingmachines", "ab-prime"] },
      { title: "Meta、Apple、Amazon、Microsoft", status: "manual", how: "自有招聘系统，没有公开 API：网页监控具体岗位搜索页，或收录" },
      { title: "字节 Seed、阿里通义、月之暗面、智谱、MiniMax、DeepSeek", status: "manual", how: "官网 / Boss 直聘 / 脉脉：收录书签" },
    ],
  },
  {
    title: "社交与社区",
    why: "研究员和创始人会直接说「我们在找 X 类型的环境」；标注员社区能看到项目起落。",
    ideas: [
      { title: "X（研究员、创始人、VC）", status: "key", how: "X API 搜索（X_BEARER_TOKEN）；没有 API 时用收录书签", presets: ["x-envs", "x-data"] },
      { title: "Reddit：r/outlier_ai、r/DataAnnotationTech、r/MachineLearning、r/LocalLLaMA", status: "auto", how: "建议配置 Reddit app，否则云服务器经常被拒", presets: ["rd-workers", "rd-ml"] },
      { title: "Hacker News（含每月 Who is hiring）", status: "auto", how: "Algolia 搜索", presets: ["hn-core"] },
      { title: "LinkedIn（实验室 Human Data 负责人、数据商 BD 的动态）", status: "manual", how: "收录书签" },
      { title: "Discord / Slack：各数据商的专家社区、Prime Intellect、EleutherAI", status: "manual", how: "看到有价值的消息就收录" },
      { title: "即刻、小红书、知乎、微信公众号、脉脉", status: "manual", how: "收录书签；公众号可接 RSS 转换服务" },
    ],
  },
  {
    title: "研究与开源",
    why: "论文和开源发布说明研究方向在往哪走，以及哪些环境 / 数据还缺。",
    ideas: [
      { title: "arXiv：RL 环境、可验证奖励、后训练数据", status: "auto", how: "已接入两个查询", presets: ["ax-envs", "ax-data"] },
      { title: "Hugging Face 数据集（按关键词或盯组织）", status: "auto", how: "预设：OpenAI、NVIDIA、Ai2", presets: ["hf-env", "hf-openai", "hf-nvidia", "hf-allenai"] },
      { title: "GitHub 新环境仓库", status: "auto", how: "已接入", presets: ["gh-envs"] },
      { title: "Prime Intellect Environments Hub、模型 system card / tech report 的数据章节", status: "idea", how: "网页监控 + 每次发布手动收录要点" },
    ],
  },
  {
    title: "资金与交易",
    why: "融资额和大合同是需求规模的滞后但最硬的证据。",
    ideas: [
      { title: "Google News：数据商、RL 环境公司、数据授权", status: "auto", how: "已接入中英文", presets: ["nw-vendors", "nw-envs", "nw-zh"] },
      { title: "Newsletter：Interconnects、Latent Space、Import AI", status: "auto", how: "RSS", presets: ["rss-interconnects", "rss-latentspace", "rss-importai"] },
      { title: "The Information、Crunchbase、PitchBook", status: "idea", how: "付费源：有订阅的话可以接 RSS / API" },
    ],
  },
  {
    title: "一手信号（最值钱）",
    why: "客户询价、BD 对话、专家访谈里的需求，公开渠道永远看不到。",
    ideas: [
      { title: "客户询价、BD / 销售对话、投资人透露的需求", status: "manual", how: "「收录」里直接粘贴，标记为需求；或通过 MCP 让 Claude 帮你记" },
      { title: "SimReal Sync 外联管道里的客户笔记", status: "idea", how: "下一步：两边打通，自动同步客户提到的需求" },
      { title: "政府采购、数据交易所（中国政府采购网、上海 / 深圳数据交易所、SAM.gov）", status: "idea", how: "网页监控招标列表" },
      { title: "Upwork / Fiverr 上的 AI 训练外包单", status: "idea", how: "网页监控搜索结果页" },
    ],
  },
];
