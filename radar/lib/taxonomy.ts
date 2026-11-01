/**
 * The demand taxonomy. Topics are seeded into rd_topics and can be edited in Settings;
 * labs (buyers) and data vendors are code-defined because their aliases need care.
 */

export type TopicDef = { key: string; label: string; grp: "format" | "domain"; color: string; keywords: string[] };

export const GROUP_LABEL: Record<TopicDef["grp"], string> = { format: "数据形态", domain: "领域" };

export const DEFAULT_TOPICS: TopicDef[] = [
  /* ── data formats: what is being bought ── */
  { key: "rl_env", label: "RL 环境", grp: "format", color: "#6e56cf", keywords: [
    "rl environment", "rl env", "rl gym", "reinforcement learning environment", "environment engineer", "environments engineer",
    "agentic environment", "agent environment", "training environment", "gym environment", "sandbox environment", "verifier",
    "verifiable reward", "rlvr", "reward model", "reward function", "reward hacking", "environment hub", "env hub",
    "replica environment", "强化学习环境", "RL环境", "仿真环境", "训练环境",
  ] },
  { key: "annotation", label: "标注 / 人工数据", grp: "format", color: "#3e63dd", keywords: [
    "annotation", "annotator", "data labeling", "data labelling", "labeler", "transcription", "human data", "data annotation",
    "ai trainer", "ai tutor", "rater", "数据标注", "标注员", "人工数据",
  ] },
  { key: "sft", label: "SFT / 示范", grp: "format", color: "#0d74ce", keywords: [
    "sft", "supervised fine-tuning", "supervised fine tuning", "instruction tuning", "demonstration data", "prompt writing",
    "response writing", "write prompts", "golden response", "指令数据", "微调数据",
  ] },
  { key: "preference", label: "偏好 / RLHF", grp: "format", color: "#0090ff", keywords: [
    "rlhf", "human feedback", "preference data", "preference ranking", "pairwise comparison", "side-by-side", "rate responses",
    "rank responses", "response rating", "dpo", "偏好数据", "人类反馈",
  ] },
  { key: "reasoning", label: "推理 / CoT", grp: "format", color: "#12a594", keywords: [
    "chain of thought", "chain-of-thought", "reasoning trace", "reasoning data", "step-by-step solution", "worked solution",
    "思维链", "推理数据",
  ] },
  { key: "trajectories", label: "Agent 轨迹", grp: "format", color: "#29a383", keywords: [
    "trajectory", "trajectories", "agent traces", "tool-use traces", "action logs", "screen recording", "computer use data",
    "browsing data", "agent data", "轨迹数据",
  ] },
  { key: "rubric", label: "Rubric / 评分", grp: "format", color: "#ab6400", keywords: [
    "rubric", "grading criteria", "grader", "scoring guideline", "评分标准",
  ] },
  { key: "eval", label: "评测 / Benchmark", grp: "format", color: "#e54d2e", keywords: [
    "eval", "evals", "evaluation set", "benchmark", "leaderboard", "held-out test", "model evaluation", "评测集", "基准测试",
  ] },
  { key: "pretraining", label: "预训练 / 授权", grp: "format", color: "#8d8d86", keywords: [
    "pretraining data", "pre-training data", "training corpus", "data licensing", "licensed data", "content licensing",
    "licensing deal", "web crawl", "copyrighted", "预训练数据", "数据授权", "版权",
  ] },
  { key: "synthetic", label: "合成数据", grp: "format", color: "#d6409f", keywords: ["synthetic data", "data generation", "distillation", "合成数据"] },

  /* ── domains: for what capability ── */
  { key: "coding", label: "编程 / SWE", grp: "domain", color: "#3e63dd", keywords: [
    "coding", "software engineer", "software engineering", "swe-bench", "swe bench", "code review", "programming", "programmer",
    "full-stack", "python", "typescript", "javascript", "rust", "golang", "java", "c++", "pull request", "leetcode",
    "competitive programming", "编程", "代码", "程序员",
  ] },
  { key: "computer_use", label: "Computer Use", grp: "domain", color: "#6e56cf", keywords: [
    "computer use", "computer-use", "browser agent", "browser use", "web agent", "gui agent", "ui agent", "web navigation",
    "osworld", "webarena", "desktop automation", "operator agent", "电脑操作", "浏览器智能体", "GUI智能体",
  ] },
  { key: "agentic", label: "Agent / 工具调用", grp: "domain", color: "#8e4ec6", keywords: [
    "agentic", "ai agent", "ai agents", "tool use", "tool-use", "tool calling", "function calling", "mcp", "multi-step",
    "long-horizon", "智能体", "工具调用",
  ] },
  { key: "enterprise", label: "企业软件 / 工作流", grp: "domain", color: "#0d74ce", keywords: [
    "enterprise workflow", "enterprise software", "salesforce", "crm", "erp", "servicenow", "jira", "zendesk", "hubspot",
    "workday", "excel", "spreadsheet", "customer support", "back office", "企业软件", "工作流",
  ] },
  { key: "math", label: "数学", grp: "domain", color: "#12a594", keywords: [
    "math", "mathematics", "mathematician", "olympiad", "imo", "theorem", "lean 4", "formal verification", "statistician",
    "数学", "奥赛", "定理",
  ] },
  { key: "science", label: "理科 STEM", grp: "domain", color: "#30a46c", keywords: [
    "physics", "physicist", "chemistry", "chemist", "biology", "biologist", "biochemistry", "genomics", "materials science",
    "stem", "物理", "化学", "生物",
  ] },
  { key: "medical", label: "医疗", grp: "domain", color: "#e5484d", keywords: [
    "medical", "medicine", "physician", "doctor", "clinical", "clinician", "radiology", "radiologist", "nurse", "nursing",
    "pharmacist", "pharmacology", "healthcare", "dentist", "surgeon", "psychiatrist", "veterinarian", "医疗", "医学", "医生", "临床",
  ] },
  { key: "legal", label: "法律", grp: "domain", color: "#ab6400", keywords: [
    "legal", "lawyer", "attorney", "law firm", "paralegal", "litigation", "contract review", "juris doctor", "bar exam", "法律", "律师",
  ] },
  { key: "finance", label: "金融 / 会计", grp: "domain", color: "#f76b15", keywords: [
    "finance", "financial", "investment banking", "investment banker", "accounting", "accountant", "cpa", "cfa",
    "equity research", "private equity", "hedge fund", "trader", "financial modeling", "actuary", "金融", "会计", "投行", "财务",
  ] },
  { key: "engineering", label: "工程 / 硬件", grp: "domain", color: "#978365", keywords: [
    "mechanical engineer", "electrical engineer", "civil engineer", "chemical engineer", "aerospace", "cad", "chip design",
    "verilog", "fpga", "hardware engineer", "pcb", "芯片", "硬件",
  ] },
  { key: "robotics", label: "机器人 / 具身", grp: "domain", color: "#0090ff", keywords: [
    "robot", "robotics", "embodied", "teleoperation", "teleop", "manipulation", "humanoid", "egocentric", "first-person video",
    "motion capture", "mocap", "sim2real", "sim-to-real", "isaac sim", "mujoco", "lerobot", "dexterous", "机器人", "具身", "遥操作",
  ] },
  { key: "vision", label: "图像 / 视频", grp: "domain", color: "#d6409f", keywords: [
    "image", "images", "video", "videos", "multimodal", "computer vision", "vision-language", "vlm", "visual", "captioning",
    "bounding box", "segmentation", "photography", "图像", "视频", "多模态",
  ] },
  { key: "audio", label: "语音 / 音频", grp: "domain", color: "#e93d82", keywords: [
    "audio", "speech", "voice", "asr", "tts", "speech recognition", "voice actor", "voice over", "accent", "music", "语音", "音频", "配音",
  ] },
  { key: "games", label: "游戏 / 世界模型", grp: "domain", color: "#7d66d9", keywords: [
    "game", "gaming", "game engine", "unity", "unreal", "minecraft", "simulation", "simulator", "3d environment", "world model",
    "游戏", "世界模型",
  ] },
  { key: "multilingual", label: "多语言", grp: "domain", color: "#00a2c7", keywords: [
    "multilingual", "native speaker", "translation", "translator", "localization", "bilingual", "language expert", "linguist",
    "low-resource language", "多语言", "翻译", "小语种",
  ] },
  { key: "chinese", label: "中文", grp: "domain", color: "#ce2c31", keywords: ["chinese", "mandarin", "cantonese", "中文", "汉语", "粤语"] },
  { key: "creative", label: "写作 / 创意", grp: "domain", color: "#a18072", keywords: [
    "creative writing", "writer", "copywriter", "screenwriter", "poetry", "fiction", "storytelling", "journalist", "写作", "编剧", "文案",
  ] },
  { key: "safety", label: "安全 / 红队", grp: "domain", color: "#dc3e42", keywords: [
    "red team", "red teaming", "red-teaming", "jailbreak", "adversarial", "ai safety", "trust and safety", "cybersecurity",
    "security researcher", "penetration test", "pentest", "ctf", "红队", "越狱", "AI安全",
  ] },
];

export const FORMAT_DATA_KEYS = ["annotation", "sft", "preference", "reasoning", "trajectories", "pretraining", "synthetic"];

/* ── buyers: frontier labs and other model builders ── */
export type OrgDef = { key: string; re: RegExp; cn?: boolean };

export const BUYERS: OrgDef[] = [
  { key: "OpenAI", re: /\bopen ?ai\b|\bchatgpt\b|\bgpt-?(?:4|5|o)\w*/i },
  { key: "Anthropic", re: /\banthropic\b|\bclaude\b/i },
  { key: "Google DeepMind", re: /\bdeep ?mind\b|\bgemini\b|\bgoogle (?:ai|research|brain)\b/i },
  { key: "Meta", re: /\bMeta(?: AI)?\b(?![- ]?(?:data|learning|analysis))|\bllama ?\d|\bsuperintelligence labs\b/ },
  { key: "xAI", re: /\bxai\b|\bgrok\b/i },
  { key: "Microsoft", re: /\bmicrosoft\b/i },
  { key: "Amazon", re: /\bamazon (?:agi|nova)\b|\bamazon\b/i },
  { key: "Apple", re: /\bApple(?: Intelligence)?\b/ },
  { key: "NVIDIA", re: /\bnvidia\b/i },
  { key: "Mistral", re: /\bmistral\b/i },
  { key: "Cohere", re: /\bcohere\b/i },
  { key: "Thinking Machines", re: /\bthinking machines\b/i },
  { key: "SSI", re: /\bsafe superintelligence\b|\bSSI\b/ },
  { key: "Reflection AI", re: /\breflection ai\b/i },
  { key: "Perplexity", re: /\bperplexity\b/i },
  { key: "Cursor", re: /\banysphere\b|\bcursor (?:ai|ide)\b/i },
  { key: "Cognition", re: /\bcognition (?:ai|labs)\b|\bdevin\b/i },
  { key: "Physical Intelligence", re: /\bphysical intelligence\b/i },
  { key: "Figure", re: /\bfigure ai\b/i },
  { key: "Tesla", re: /\btesla\b|\boptimus\b/i },
  { key: "DeepSeek", re: /\bdeepseek\b|深度求索/i, cn: true },
  { key: "Alibaba Qwen", re: /\bqwen\b|\balibaba\b|通义|阿里巴巴/i, cn: true },
  { key: "ByteDance", re: /\bbytedance\b|\bdoubao\b|字节跳动|豆包/i, cn: true },
  { key: "Moonshot", re: /\bmoonshot ai\b|\bkimi\b|月之暗面/i, cn: true },
  { key: "Zhipu", re: /\bzhipu\b|\bz\.ai\b|智谱/i, cn: true },
  { key: "MiniMax", re: /\bminimax\b/i, cn: true },
  { key: "Tencent", re: /\btencent\b|\bhunyuan\b|腾讯|混元/i, cn: true },
  { key: "Baidu", re: /\bbaidu\b|\bernie\b|百度|文心/i, cn: true },
];

/* ── vendors: data / RL-environment suppliers (the "competitors and channels") ── */
export const VENDORS: OrgDef[] = [
  { key: "Scale AI", re: /\bscale ?ai\b|\boutlier(?:\.ai| ai)\b|\bremotasks\b/i },
  { key: "Surge AI", re: /\bsurge ?ai\b|\bsurgehq\b|\bdata ?annotation(?:\.tech| tech)\b/i },
  { key: "Mercor", re: /\bmercor\b/i },
  { key: "Turing", re: /\bturing\.com\b|\bturing (?:ai|inc|enterprises)\b/i },
  { key: "Handshake AI", re: /\bhandshake ai\b|\bjoinhandshake\b/i },
  { key: "micro1", re: /\bmicro1\b/i },
  { key: "Invisible", re: /\binvisible tech(?:nologies)?\b|\binvisible ai\b/i },
  { key: "Labelbox", re: /\blabelbox\b|\balignerr\b/i },
  { key: "Snorkel AI", re: /\bsnorkel\b/i },
  { key: "Toloka", re: /\btoloka\b|\bmindrift\b/i },
  { key: "Appen", re: /\bappen\b/i },
  { key: "Prolific", re: /\bprolific\.com\b/i },
  { key: "TELUS Digital", re: /\btelus (?:international|digital)\b/i },
  { key: "iMerit", re: /\bimerit\b/i },
  { key: "Sepal AI", re: /\bsepal ai\b/i },
  { key: "Datacurve", re: /\bdatacurve\b/i },
  { key: "Mechanize", re: /\bMechanize\b/ },
  { key: "Prime Intellect", re: /\bprime ?intellect\b/i },
  { key: "Halluminate", re: /\bhalluminate\b/i },
  { key: "Bespoke Labs", re: /\bbespoke labs\b/i },
  { key: "海天瑞声", re: /海天瑞声|\bspeechocean\b/i, cn: true },
  { key: "数据堂", re: /数据堂|\bdatatang\b/i, cn: true },
  { key: "标贝科技", re: /标贝|\bdatabaker\b/i, cn: true },
  { key: "云测数据", re: /云测数据|\btestin\b/i, cn: true },
];

/** Terms that make almost anything relevant to "who is buying training data / RL environments". */
export const CORE_TERMS = [
  "training data", "ai training", "train ai", "post-training", "post training", "human data", "data vendor", "data provider",
  "data partner", "data partnerships", "rl environment", "rl environments", "rl env", "reward model", "rlhf", "data labeling",
  "data annotation", "expert data", "ai tutor", "ai trainer", "frontier lab", "frontier labs", "fine-tuning data", "evals",
  "训练数据", "数据标注", "强化学习环境", "后训练", "数据供应商", "大模型数据",
];

export const CATEGORY_LABEL: Record<string, string> = { data: "数据", env: "RL 环境", eval: "评测", other: "其他" };
export const INTENT_LABEL: Record<string, string> = {
  demand: "需求", hiring: "招人", supply: "供给", release: "发布", research: "论文", news: "新闻", discussion: "讨论",
};
export const INTENT_HELP: Record<string, string> = {
  demand: "有人明确在找数据 / 环境 / 供应商",
  hiring: "数据商或实验室在招专家、标注员、环境工程师（间接需求）",
  supply: "供应商在推产品、发布能力",
  release: "开源数据集 / 环境 / 基准发布",
  research: "论文：说明研究方向在用什么数据和环境",
  news: "融资、合作、合同、收购",
  discussion: "一般讨论",
};

export const CHANNEL_META: Record<string, { label: string; abbr: string; color: string }> = {
  jobs: { label: "岗位", abbr: "JB", color: "#3e63dd" },
  x: { label: "X", abbr: "X", color: "#0b0b0f" },
  reddit: { label: "Reddit", abbr: "R", color: "#ff4500" },
  hn: { label: "Hacker News", abbr: "Y", color: "#ff6600" },
  arxiv: { label: "arXiv", abbr: "ax", color: "#b31b1b" },
  hf: { label: "Hugging Face", abbr: "HF", color: "#ff9d00" },
  github: { label: "GitHub", abbr: "GH", color: "#24292f" },
  news: { label: "新闻", abbr: "N", color: "#4285f4" },
  rss: { label: "博客 / RSS", abbr: "RS", color: "#ee802f" },
  web: { label: "网页变化", abbr: "W", color: "#12a594" },
  manual: { label: "手动收录", abbr: "+", color: "#6e56cf" },
};

export const ORG_TYPE_LABEL: Record<string, string> = { vendor: "数据商", lab: "实验室", env: "RL 环境公司", other: "其他" };
