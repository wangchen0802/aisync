import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ensureToken } from "@/lib/apitoken";
import { origin } from "@/lib/origin";
import { listProjects } from "@/lib/core";
import { regenerateToken } from "@/lib/actions";
import { buildDistillPrompt } from "@/lib/selfdistill";
import { ago, type SourceKey } from "@/lib/meta";
import { ActionButton, CopyButton } from "@/components/client";
import { ContextCopy } from "@/components/context-copy";
import { Icon, Source } from "@/components/ui";
import { AutoPublishToggle } from "@/components/prefs";
import { one } from "@/lib/db";

export const metadata = { title: "连接 AI" };

const WEB: SourceKey[] = ["deepseek", "gemini", "grok", "kimi", "doubao", "qwen", "perplexity"];
const SAY = ["同步到 SimReal", "先读一下 SimReal 的团队上下文，再帮我…", "把今天和红杉的会记到 SimReal，周五跟进", "我这周有哪些 DDL？"];

export default async function Connect() {
  const me = await requireUser();
  const [token, base, projects, row, prompt] = await Promise.all([
    ensureToken(me.id), origin(), listProjects(),
    one<{ auto_publish: boolean; last_ingest_at: string | null }>("select auto_publish, last_ingest_at from users where id = $1", [me.id]),
    buildDistillPrompt(me),
  ]);
  const masked = `${token.slice(0, 6)}••••${token.slice(-4)}`;
  const connector = `${base}/api/mcp/${token}`;
  const installCmd = `curl -fsSL ${base}/api/hook/install -H "Authorization: Bearer ${token}" | node`;
  const mcpCmd = `claude mcp add --transport http --scope user simreal ${base}/api/mcp --header "Authorization: Bearer ${token}"`;
  const cursorJson = JSON.stringify({ mcpServers: { simreal: { url: `${base}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  const hide = (t: string) => t.replace(token, masked);

  return (
    <>
      <div className="ph">
        <div>
          <h1>连接 AI</h1>
          <p className="ph-meta">
            <span>用你已有的 ChatGPT / Claude 订阅，不需要 API</span>
            <span>{row?.last_ingest_at ? `最近同步 ${ago(row.last_ingest_at)}` : "还没有同步过"}</span>
          </p>
        </div>
      </div>

      <section className="box sub-hero">
        <div className="sub-h">
          <div>
            <h2>在 Claude 和 ChatGPT 里直接用</h2>
            <p className="muted">把 SimReal 加成连接器。之后在任何对话里说一句，AI 自己整理要点发给团队，也会先读团队记忆再回答。</p>
          </div>
        </div>
        <div className="sub-url">
          <span className="mono">{hide(connector)}</span>
          <CopyButton className="btn sm pri" text={connector} label="复制连接器地址" done="已复制" />
        </div>
        <div className="sub-steps">
          <div>
            <h3><Source s="claude" only xl />Claude <span className="faint">Pro · Max · Team</span></h3>
            <ol className="ol">
              <li>设置 → 连接器（Connectors）→ 添加自定义连接器</li>
              <li>名称填 SimReal，粘贴上面的地址</li>
              <li>对话框的工具菜单里打开 SimReal</li>
            </ol>
            <p className="faint sm">Team / Enterprise 需要管理员先在组织设置里添加。</p>
          </div>
          <div>
            <h3><Source s="chatgpt" only xl />ChatGPT <span className="faint">Plus · Pro</span></h3>
            <ol className="ol">
              <li>设置 → 应用与连接器 → 高级设置，开启开发者模式</li>
              <li>创建连接器：粘贴上面的地址，认证选「无」</li>
              <li>新对话里选开发者模式，启用 SimReal</li>
            </ol>
            <p className="faint sm">写入操作 ChatGPT 会先让你确认。</p>
          </div>
          <div>
            <h3><Icon name="chat" />然后这样说</h3>
            <ul className="say">{SAY.map((s) => <li key={s}>「{s}」</li>)}</ul>
          </div>
        </div>
        <p className="faint sm" style={{ margin: 0 }}>地址里带着你的个人密钥，别发给别人；泄露了就在下面重置，旧地址立刻失效。菜单名称可能随产品更新略有变化。</p>
      </section>

      <div className="two">
        <section className="box pad"><AutoPublishToggle on={row?.auto_publish ?? false} /></section>
        <section className="box pad stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b style={{ fontSize: 13.5 }}>个人密钥</b>
            <ActionButton className="btn sm ghost" action={regenerateToken} confirm="旧密钥和连接器地址都会失效">重置</ActionButton>
          </div>
          <div className="token"><span>{masked}</span><CopyButton text={token} label="复制" /></div>
        </section>
      </div>

      <div className="conn">
        <section className="box card">
          <h3><Icon name="download" />浏览器插件</h3>
          <div className="provrow">{WEB.slice(0, 5).map((k) => <Source key={k} s={k} />)}<span className="faint" style={{ fontSize: 12 }}>以及 ChatGPT、Claude 网页版</span></div>
          <p className="muted sm" style={{ margin: 0 }}>给没有连接器的 AI 用。点「同步到团队」，插件让当前 AI 自己整理要点，回复完成后自动同步。</p>
          <ol className="ol">
            <li>下载并解压</li>
            <li>打开 <span className="mono">chrome://extensions</span>，开启开发者模式</li>
            <li>加载已解压的扩展程序 → 选 <span className="mono">simreal-sync</span></li>
          </ol>
          <div><a className="btn pri" href="/api/extension"><Icon name="download" />下载插件</a></div>
        </section>

        <section className="box card">
          <h3><Source s="claudecode" only xl />Claude Code</h3>
          <p className="muted sm" style={{ margin: 0 }}>一条命令：加上 MCP 和 <span className="mono">/simreal</span> 命令。会话里输入 <span className="mono">/simreal</span>，Claude 整理本次会话并同步。</p>
          <pre className="code">{hide(installCmd)}</pre>
          <div className="row"><CopyButton className="btn sm pri" text={installCmd} label="复制命令" done="已复制，到终端运行" /></div>
          <details className="more-d"><summary>只装 MCP</summary><pre className="code">{hide(mcpCmd)}</pre><CopyButton text={mcpCmd} label="复制" /></details>
        </section>

        <section className="box card">
          <h3><Source s="cursor" only xl />Cursor · 其他 MCP 客户端</h3>
          <p className="muted sm" style={{ margin: 0 }}>写入 <span className="mono">~/.cursor/mcp.json</span></p>
          <pre className="code">{hide(cursorJson)}</pre>
          <div className="row"><CopyButton text={cursorJson} label="复制配置" /></div>
        </section>

        <section className="box card">
          <h3><Icon name="copy" />任何 AI，手动</h3>
          <p className="muted sm" style={{ margin: 0 }}>把整理指令发给 AI，再把它的回复粘贴到<Link className="link" href="/import">导入页</Link>。</p>
          <div className="row"><CopyButton className="btn sm" text={prompt} label="复制整理指令" done="已复制" /></div>
          <p className="muted sm" style={{ margin: "6px 0 0" }}>让 AI 了解团队：复制上下文，贴到对话开头或 Project 知识库。</p>
          <ContextCopy projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          <Link className="link" href="/memory#link">只读链接、.md 下载 →</Link>
        </section>
      </div>
    </>
  );
}
