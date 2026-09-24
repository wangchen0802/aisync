import { requireUser } from "@/lib/session";
import { ensureToken } from "@/lib/apitoken";
import { origin } from "@/lib/origin";
import { listProjects } from "@/lib/core";
import { regenerateToken } from "@/lib/actions";
import { ago, type SourceKey } from "@/lib/meta";
import Link from "next/link";
import { ActionButton, CopyButton } from "@/components/client";
import { ContextCopy } from "@/components/context-copy";
import { Icon, Source } from "@/components/ui";
import { AutoPublishToggle } from "@/components/prefs";
import { one } from "@/lib/db";

export const metadata = { title: "连接 AI" };

const WEB: SourceKey[] = ["chatgpt", "claude", "deepseek", "gemini", "grok", "perplexity", "kimi", "doubao", "qwen"];

export default async function Connect() {
  const me = await requireUser();
  const token = await ensureToken(me.id);
  const base = await origin();
  const projects = await listProjects();
  const auto = (await one<{ auto_publish: boolean }>("select auto_publish from users where id = $1", [me.id]))?.auto_publish ?? false;
  const [last] = await Promise.all([one<{ last_ingest_at: string | null }>("select last_ingest_at from users where id = $1", [me.id])]);
  const masked = `${token.slice(0, 6)}••••${token.slice(-4)}`;
  const installCmd = `curl -fsSL ${base}/api/hook/install -H "Authorization: Bearer ${token}" | node`;
  const mcpCmd = `claude mcp add --transport http --scope user simreal ${base}/api/mcp --header "Authorization: Bearer ${token}"`;
  const cursorJson = JSON.stringify({ mcpServers: { simreal: { url: `${base}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);
  const hide = (t: string) => t.replace(token, masked);

  return (
    <>
      <div className="ph">
        <div>
          <h1>连接 AI</h1>
          <p className="ph-meta"><span>{last?.last_ingest_at ? `最近同步 ${ago(last.last_ingest_at)}` : "还没有同步过"}</span></p>
        </div>
      </div>

      <div className="two">
        <section className="box pad"><AutoPublishToggle on={auto} /></section>
        <section className="box pad stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b style={{ fontSize: 13.5 }}>个人密钥</b>
            <ActionButton className="btn sm ghost" action={regenerateToken} confirm="旧密钥会失效">重置</ActionButton>
          </div>
          <div className="token"><span>{masked}</span><CopyButton text={token} label="复制" /></div>
        </section>
      </div>

      <div className="conn">
        <section className="box card">
          <h3><Icon name="download" />浏览器插件</h3>
          <div className="provrow">{WEB.slice(0, 5).map((k) => <Source key={k} s={k} />)}<span className="faint" style={{ fontSize: 12 }}>等 {WEB.length} 个</span></div>
          <ol className="ol">
            <li>下载并解压</li>
            <li>打开 <span className="mono">chrome://extensions</span>，开启开发者模式</li>
            <li>加载已解压的扩展程序 → 选 <span className="mono">simreal-sync</span></li>
          </ol>
          <p className="muted sm" style={{ margin: 0 }}>AI 页面右下角：同步到团队（Alt+Shift+S）· 插入团队上下文</p>
          <div><a className="btn pri" href="/api/extension"><Icon name="download" />下载插件</a></div>
        </section>

        <section className="box card">
          <h3><Source s="claudecode" only xl />Claude Code</h3>
          <p className="muted sm" style={{ margin: 0 }}>一条命令：会话结束自动同步 + MCP 读写团队记忆</p>
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
          <h3><Icon name="copy" />其他 AI</h3>
          <p className="muted sm" style={{ margin: 0 }}>复制团队上下文，粘贴到对话开头或 Project 知识库</p>
          <ContextCopy projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
          <Link className="link" href="/memory#link">只读链接、.md 下载 →</Link>
        </section>
      </div>
    </>
  );
}
