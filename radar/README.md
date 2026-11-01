# 需求雷达 · Demand Radar

监控 AI 实验室对**训练数据**和 **RL 环境**的需求：谁在买、买什么、什么领域、什么价位，在变多还是变少。

它每天自动抓一遍各个渠道，把所有内容变成统一的「信号」，按方向分类、打分、看趋势，团队在上面一起形成和验证「需求假设」，每周一出简报发到 Lark 群。

## 看哪些渠道

| 渠道 | 怎么接 | 为什么有用 |
| --- | --- | --- |
| **数据商招聘页**（Scale AI 已接入；Mercor、Snorkel、Labelbox / Alignerr、Handshake、Turing、Invisible、micro1 一键添加） | Greenhouse / Lever / Ashby 公开 API，每次抓全量 | 数据商接到实验室订单后才会招对应领域的专家：**岗位的领域、数量、时薪 ≈ 实验室正在买什么** |
| **实验室招聘页**（Anthropic、OpenAI、Google DeepMind、xAI、Mistral 已接入） | 同上，只保留 Human Data / RL Environments / Post-training / Evals 等岗位 | 实验室自己在加大哪类投入 |
| **X** | X API v2 搜索（需要 `X_BEARER_TOKEN`）；没有 API 用「收录」书签 | 研究员、创始人公开说在找什么 |
| **Reddit**（r/outlier_ai、r/DataAnnotationTech、r/MachineLearning…） | 公开 API，建议配置 Reddit app | 标注员社区能看到项目的起落、时薪涨跌 |
| **Hacker News** | Algolia 搜索（含每月 Who is hiring） | 新公司、招聘、讨论 |
| **arXiv / Hugging Face / GitHub** | 公开 API | 研究方向在用什么环境和数据、开源发布 |
| **新闻**（中英文） | Google News RSS | 融资、合同、数据授权 |
| **Newsletter / 博客** | 任意 RSS | Interconnects 等 |
| **任意网页** | 网页变化监控（没有 API 的招聘页、价格页） | 页面新增了什么 |
| **一手信号**：客户询价、BD 对话、群消息 | 「收录信号」按钮、浏览器书签、API、在 Claude 里说「记到雷达」 | 最值钱、公开渠道永远看不到 |

「渠道」页里有一张**渠道地图**，列出所有想到的渠道和接入状态（自动 / 需要 Key / 手动收录 / 待讨论），一键试运行和添加。新渠道直接在页面上加：任何公司的 Greenhouse / Lever / Ashby board 名、Reddit 版块、搜索词、RSS、网页。

## 怎么分析

- **分类**：每条信号自动标出
  - 数据形态（买的是什么）：RL 环境、标注 / 人工数据、SFT、偏好 / RLHF、推理 CoT、Agent 轨迹、Rubric、评测、预训练 / 授权、合成数据
  - 领域（为了什么能力）：编程、Computer Use、Agent、企业软件、数学、理科、医疗、法律、金融、工程、机器人、图像视频、语音、游戏 / 世界模型、多语言、中文、写作、安全红队
  - 类型：明确需求 / 招人 / 供给 / 发布 / 论文 / 新闻 / 讨论
  - 提到的实验室（买方）和数据商（供给方）、时薪 / 年薪、专家岗还是全职岗
  - 相关度 0–100
- 默认用**关键词规则**（中英文，在「设置 → 主题词」里改）；配置 `ANTHROPIC_API_KEY` 后，新信号再由 **Claude** 复核并写一句中文摘要。
- **岗位追踪**：每次抓取和上一次对比，记录新增、下架、重新开放、薪资变化；按公司看在招数、专家岗数、时薪中位数。第一次抓取只建立基线，不会把已有岗位都算成「新增」。如果某个招聘页突然返回空列表，会先跳过下架判断，避免误判。
- **趋势**：方向 × 周热力图，本周 vs 前 4 周平均；被提到的实验室 / 数据商；各方向的专家时薪分布。
- **需求假设**：团队一起想的地方。把「编程类 RL 环境需求在上升」写成假设，挂上信号做证据，讨论、写下一步，状态从观察中 → 验证中 → 在做。系统会按方向推荐新证据。
- **周报**：每周一 9:00（北京时间）生成并发到群里。有 API Key 时由 Claude 写分析版（每个判断标出依据的信号编号）；没有时生成统计版，并且可以一键复制上下文到 Claude / ChatGPT，用自己的订阅分析。
- **即时提醒**：每次抓取后，高相关的新信号和岗位变化推到 Lark / 飞书、Slack、企业微信群。

## 部署到 Vercel（约 10 分钟）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwangchen0802%2Faisync&root-directory=radar&env=AUTH_SECRET,TEAM_PASSCODE,CRON_SECRET&envDescription=AUTH_SECRET%20%E7%94%A8%20openssl%20rand%20-base64%2032%20%E7%94%9F%E6%88%90&project-name=demand-radar)

1. Vercel → Add New → Project，选这个仓库，**Root Directory 选 `radar`**（和 SimReal Sync 是两个独立项目）。
2. 数据库：Storage → Create Database → Neon。**也可以直接用 SimReal Sync 的数据库**：把它的 `DATABASE_URL` 填进来即可，雷达的表都以 `rd_` 开头，不会冲突。表在第一次访问时自动创建，并自动加载默认主题词和渠道。
3. 环境变量：

   | 变量 | 必填 | 说明 |
   | --- | --- | --- |
   | `DATABASE_URL` | ✅ | Postgres |
   | `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
   | `TEAM_PASSCODE` 或 `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ✅ 至少一种 | 登录方式。Google 回调地址 `https://<域名>/api/auth/callback/google` |
   | `ALLOWED_EMAIL_DOMAINS` | 建议 | 例如 `simreal.ai` |
   | `CRON_SECRET` | 建议 | 开启定时抓取和周报 |
   | `X_BEARER_TOKEN` | 可选 | X 搜索（developer.x.com） |
   | `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | 建议 | reddit.com/prefs/apps 建一个 **script** 类型的 app。Reddit 经常拒绝云服务器的匿名请求 |
   | `GITHUB_TOKEN` | 可选 | 提高 GitHub 搜索限额，不需要任何权限 |
   | `ANTHROPIC_API_KEY` | 可选 | Claude 分类 + 周报（默认 `claude-opus-5-5`，可用 `ANTHROPIC_MODEL` 改） |
   | `LARK_WEBHOOK_URL` / `SLACK_WEBHOOK_URL` | 可选 | 也可以在「设置 → 通知」里填 |

4. Deploy，打开 `https://<域名>/api/health` 检查：`database`、`auth_secret` 为 `true`。
5. 登录（第一个登录的人是管理员）→ 总览页点「立即抓取」。第一次会导入各招聘页的全部在招岗位，大约 1–2 分钟。

### 抓取频率

`vercel.json` 里的定时任务：每天 06:00（北京时间）抓取所有到期渠道，每周一 09:00 生成周报。Vercel 免费版定时任务只能每天一次；想更频繁（例如 X 每 6 小时），升级 Pro 后改 `vercel.json`，或者用任意外部定时器（GitHub Actions、cron-job.org）请求：

```
GET https://<域名>/api/cron/collect?key=<CRON_SECRET>
```

每个渠道按自己的频率判断是否到期，多请求不会重复抓。

## 和 Claude / ChatGPT 一起用

在「设置 → 收录书签 · 连接 Claude」里：

- **收录书签**：拖到书签栏。在 X、LinkedIn、任何网页上（可以先选中一段文字）点一下，弹出收录窗口，自动分类并标星。
- **MCP 连接器**（不需要 API Key，用自己的订阅）：把个人 MCP 地址 `https://<域名>/api/mcp/<个人密钥>` 加到 Claude 的 Custom Connectors 或 ChatGPT 的 Connectors；Claude Code：`claude mcp add --transport http radar <地址>`。然后直接问：「看一下需求雷达，本周编程类 RL 环境需求有什么变化？」「把这条记到雷达：客户 A 在找医疗 rubric 数据」。工具：`demand_report`、`search_signals`、`topic_trends`、`listing_changes`、`list_themes`、`capture_signal`、`add_evidence`。
- **API**：
  - `POST /api/capture`（`Authorization: Bearer rd_…`）：`{ url?, title?, text, intent?, note?, org? }`
  - `GET /api/context?days=7`：纯文本上下文包（统计 + 重要信号），贴给任何 AI
  - `GET /api/export?…`：按信号页的筛选条件导出 CSV（登录后）
  - `GET /api/health`：部署自检

## 本地开发

```bash
cd radar
cp .env.example .env.local      # 填 DATABASE_URL、AUTH_SECRET、TEAM_PASSCODE
npm install
npm run dev                      # http://localhost:3100
npm test                         # 分类器 / 解析器单元测试
# 端到端测试（会清空数据库，只能用测试库）：
DATABASE_URL=postgres://…/radar_test npm run test:e2e
```

端到端测试用 `tests/fixtures.ts` 里的模拟 API 返回跑完整流程：首次导入、新增 / 下架 / 薪资变化、空列表保护、渠道出错、跨渠道去重、收录、趋势、周报、MCP。

## 目录

```
app/(app)/          页面：总览、信号、趋势、岗位追踪、需求假设、周报、渠道、设置、收录
app/api/            cron/collect、cron/brief、capture、mcp、context、export、health
lib/collectors.ts   各渠道的抓取器（Greenhouse、Lever、Ashby、X、Reddit、HN、新闻、RSS、arXiv、HF、GitHub、网页）
lib/pipeline.ts     抓取 → 过滤 → 去重 → 入库 → 岗位生命周期（新增 / 下架 / 薪资变化）
lib/classify.ts     规则分类：主题、类型、实验室 / 数据商、薪资、相关度
lib/taxonomy.ts     默认主题词、实验室和数据商的识别规则
lib/catalog.ts      渠道预设和渠道地图
lib/ai.ts           Claude 批量分类、周报
lib/trends.ts       趋势、岗位、薪资统计
lib/brief.ts        周报和上下文包
lib/mcp.ts          MCP 服务（给 Claude / ChatGPT 连接器）
```
