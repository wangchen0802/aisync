# SimReal Sync

把团队每个人在 ChatGPT、Claude、DeepSeek、Gemini、Grok、Cursor、Claude Code 里的对话，自动提炼成**大家都看得见的共识和任务进度**，再把团队共识喂回每个人的 AI。

- **共识**：从 AI 对话中提炼决策，队友确认后形成共识；和已有共识矛盾时自动标出冲突。
- **任务进度**：任务从对话中抽取，之后谁在任何 AI 里继续推进，进度自动更新。支持看板、子任务、依赖和阻塞。
- **细节可选**：精简 / 标准 / 完整三档，也可以单独展开某一条。
- **收件箱**：同步进来的对话先由本人审核再发布；密钥、API Key、手机号自动打码；原始对话只有作者本人能看。
- **讨论**：每条决策 / 任务都有独立页面（`/item/<编号>`），可以评论、查看历史、复制链接发给队友。
- **自你上次查看**：打开总览先看离开这段时间谁同步了什么、什么达成了共识。
- **自动发布**（每人可选）：同步后直接发给团队，敏感内容仍留在收件箱。同一段对话重复同步只处理新增内容，不会重复提炼。
- **团队通知**：新决策待确认、发现冲突、达成共识、每日简报，推送到飞书 / 企业微信 / Slack 群（在「设置 → 团队通知」里填 Webhook）。
- **快速记录**：任意页面按 `C`，或手机底部的 ＋，一句话记下决策 / 任务，类型自动识别。
- **手机端**：底部导航，任务一键推进，可以添加到主屏幕（PWA）；Android 上可以从 ChatGPT / Claude App「分享」直接发到 SimReal。
- **问团队记忆**、**每日简报**、**⌘K 命令面板**。
- **连接 AI**：浏览器插件（一键同步，还能把团队上下文插回对话框）、Claude Code Hook（会话结束自动同步）、MCP Server（Claude Code、Cursor 等可以直接查询和写入团队记忆）。

技术栈：Next.js 15（App Router）· Auth.js · Postgres（Neon）· Claude API · 可直接部署到 Vercel。

---

## 部署到 Vercel（约 10 分钟）

1. **导入仓库**：Vercel → Add New → Project，选这个仓库，默认设置即可（Framework：Next.js）。
2. **连接数据库**：在项目里打开 **Storage → Create Database → Neon (Postgres)**，连接到这个项目，会自动设置 `DATABASE_URL`。表会在第一次访问时自动创建，不需要跑迁移。
3. **添加环境变量**（Settings → Environment Variables）：

   | 变量 | 是否必填 | 说明 |
   | --- | --- | --- |
   | `AUTH_SECRET` | ✅ | 随机字符串，可用 `openssl rand -base64 32` 生成 |
   | `TEAM_PASSCODE` | 登录方式二选一 | 团队口令。最快：把口令发给队友就能登录 |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 登录方式二选一 | Google 登录（推荐，配置方法见下） |
   | `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | 可选 | GitHub 登录 |
   | `ALLOWED_EMAIL_DOMAINS` | 建议 | 例如 `simreal.ai`，这个域名的邮箱用 Google / GitHub 登录时不需要邀请 |
   | `ANTHROPIC_API_KEY` | 强烈建议 | 开启 AI 提炼、冲突检测和问答。不填会退回规则提取 |
   | `ANTHROPIC_MODEL` | 可选 | 默认 `claude-opus-5` |
   | `CRON_SECRET` | 可选 | 工作日北京时间 18:00 自动推送每日简报（通知渠道在应用的「设置 → 团队通知」里配置） |

4. **Redeploy**，打开网站登录。**第一个登录的人自动成为管理员。**
5. 管理员在「设置」里创建项目、邀请队友（或者直接把团队口令发给大家）。
6. 每个人打开「连接 AI」页面，安装浏览器插件，配置 Claude Code / Cursor。

### 配置 Google 登录

在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 客户端 ID（类型：Web 应用）：
- 已获授权的重定向 URI：`https://<你的域名>/api/auth/callback/google`
- 把客户端 ID 和密钥分别填进 `AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`

> 能不能用 ChatGPT / Claude 账号登录？OpenAI 和 Anthropic 目前都没有开放给第三方应用使用的账号登录（OAuth），所以这里用 Google / GitHub / 团队口令登录。登录之后，每个人再通过插件和 MCP 把自己的 ChatGPT、Claude、DeepSeek、Gemini、Grok 接进来，这一步才真正用到各自的 AI 账号。

### 谁可以登录

- Google / GitHub：邮箱属于 `ALLOWED_EMAIL_DOMAINS` 或 `ALLOWED_EMAILS` 的人、管理员在「设置 → 成员」里邀请过的人，以及第一个登录的人。
- 团队口令：知道口令的人都能登录（如果设置了 `ALLOWED_EMAIL_DOMAINS`，邮箱还必须属于这个域名）。注意口令登录不会验证邮箱是不是本人的，请把口令当作团队机密保管。

---

## 连接 AI

在应用的「连接 AI」页面里都有，个人密钥已经自动填好：

| AI | 接入方式 |
| --- | --- |
| ChatGPT、Claude、DeepSeek、Gemini、Grok、Perplexity、Kimi、豆包、通义千问 | 浏览器插件：页面右下角有「同步到团队」和「插入团队上下文」两个按钮，快捷键 `Alt+Shift+S` |
| Claude Code | MCP（`claude mcp add ...`）+ SessionEnd Hook 自动同步 |
| Cursor、Windsurf、Claude Desktop 等 MCP 客户端 | 远程 MCP：`https://<你的域名>/api/mcp` |
| 其他任何 AI | 在「导入对话」页面粘贴 |

手机上：用浏览器打开网站 →「添加到主屏幕」。Android 装好后，在 ChatGPT / Claude / DeepSeek App 里选中对话「分享」→ SimReal，会直接进入导入页。

插件暂时没有上架 Chrome 商店。下载后打开 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」。

### API

- `POST /api/ingest`（`Authorization: Bearer sr_...`）：`{ source, title?, url?, text }`，把对话放进收件箱
- `POST /api/mcp`：MCP（Streamable HTTP）。工具：`search_team_memory`、`get_team_context`、`log_decision`、`create_task`、`update_task`、`sync_conversation`
- `GET /api/context?project=<id>`：纯文本的团队上下文包

---

## 本地开发

```bash
cp .env.example .env.local   # 填 DATABASE_URL、AUTH_SECRET、TEAM_PASSCODE
npm install
npm run dev
```

## 目录

```
app/(app)/        登录后的页面：总览、共识、任务、动态、收件箱、导入、问答、简报、连接 AI、设置
app/api/          ingest / mcp / context / 插件下载 / Claude Code hook / 定时简报
lib/core.ts       核心逻辑：导入、发布、共识确认、冲突解决、任务进度、搜索、上下文包
lib/ai.ts         Claude 提炼（结构化输出）、冲突/重复检测、问答；敏感信息打码；规则提取兜底
extension/        Chrome 插件（MV3）
docs/             产品设计文档
prototype/        早期交互原型
```
