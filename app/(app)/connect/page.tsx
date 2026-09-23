import { requireUser } from "@/lib/session";
import { ensureToken } from "@/lib/apitoken";
import { origin } from "@/lib/origin";
import { listProjects } from "@/lib/core";
import { regenerateToken } from "@/lib/actions";
import { SOURCES, type SourceKey } from "@/lib/meta";
import { ActionButton, CopyButton } from "@/components/client";
import { ContextCopy } from "@/components/context-copy";
import { Icon, Source } from "@/components/ui";

export const metadata = { title: "连接 AI" };

const WEB: SourceKey[] = ["chatgpt", "claude", "deepseek", "gemini", "grok", "perplexity", "kimi", "doubao", "qwen"];

export default async function Connect() {
  const me = await requireUser();
  const token = await ensureToken(me.id);
  const base = await origin();
  const projects = await listProjects();
  const masked = `${token.slice(0, 7)}${"•".repeat(18)}${token.slice(-4)}`;
  const mcpCmd = `claude mcp add --transport http simreal ${base}/api/mcp --header "Authorization: Bearer ${token}" --scope user`;
  const hookCmd = `mkdir -p ~/.claude/hooks && curl -fsSL ${base}/api/hook -H "Authorization: Bearer ${token}" -o ~/.claude/hooks/simreal-sync.mjs`;
  const hookSettings = JSON.stringify({ hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "node ~/.claude/hooks/simreal-sync.mjs", timeout: 60 }] }] } }, null, 2);
  const cursorJson = JSON.stringify({ mcpServers: { simreal: { url: `${base}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

  return (
    <>
      <div className="ph">
        <div>
          <h1>连接你的 AI</h1>
          <p>不用换工具。大家继续用自己习惯的 AI，SimReal 在旁边负责两件事：把对话里的结论同步给团队，再把团队共识带回每个 AI。</p>
        </div>
      </div>

      <section className="box">
        <div className="box-h"><h2><Icon name="lock" />你的个人密钥</h2><span className="c">插件、Claude Code、Cursor 都用它</span></div>
        <div className="pad stack">
          <div className="token">
            <span>{masked}</span>
            <CopyButton text={token} label="复制" />
            <ActionButton className="btn sm ghost" action={regenerateToken} confirm="旧密钥会立刻失效，确定？">重新生成</ActionButton>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>密钥代表你本人，不要发给别人。泄露了就点「重新生成」。</p>
        </div>
      </section>

      <div className="two">
        <section className="box card">
          <h3><Icon name="download" />浏览器插件 <span className="pill ok">推荐</span></h3>
          <p>在 ChatGPT、Claude、DeepSeek、Gemini、Grok 等网页的右下角加一个按钮：「同步到团队」把当前对话送进收件箱，「插入团队上下文」把团队共识放进输入框。</p>
          <ol className="ol">
            <li><a className="link" style={{ fontSize: 13.5 }} href="/api/extension">下载插件</a>（已自动填好地址和你的密钥），然后解压</li>
            <li>Chrome / Edge 打开 <span className="mono">chrome://extensions</span>，打开右上角「开发者模式」</li>
            <li>点「加载已解压的扩展程序」，选择解压出来的 <span className="mono">simreal-sync</span> 文件夹</li>
            <li>打开任意 AI 对话页面，点右下角的「同步到团队」，或按 <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></li>
          </ol>
          <div className="row"><a className="btn pri" href="/api/extension"><Icon name="download" />下载插件</a></div>
        </section>

        <section className="box card">
          <h3><Source s="claudecode" only xl />Claude Code</h3>
          <p>① 接入 MCP：Claude Code 做决策前会先查团队共识，也能直接记录决策、更新任务进度。</p>
          <pre className="code">{mcpCmd.replace(token, masked)}</pre>
          <div className="row"><CopyButton text={mcpCmd} label="复制命令" /></div>
          <p>② 自动同步：每次会话结束，自动把对话发到你的收件箱。先下载脚本：</p>
          <pre className="code">{hookCmd.replace(token, masked)}</pre>
          <div className="row"><CopyButton text={hookCmd} label="复制命令" /></div>
          <p>再把下面这段合并到 <span className="mono">~/.claude/settings.json</span>：</p>
          <pre className="code">{hookSettings}</pre>
          <div className="row"><CopyButton text={hookSettings} label="复制配置" /></div>
        </section>

        <section className="box card">
          <h3><Source s="cursor" only xl />Cursor 和其他 MCP 客户端</h3>
          <p>写进 <span className="mono">~/.cursor/mcp.json</span>（Windsurf、Claude Desktop 等支持远程 MCP 的客户端写法类似）。</p>
          <pre className="code">{cursorJson.replace(token, masked)}</pre>
          <div className="row"><CopyButton text={cursorJson} label="复制配置" /></div>
          <p className="faint" style={{ fontSize: 12 }}>可用工具：search_team_memory、get_team_context、log_decision、create_task、update_task、sync_conversation</p>
        </section>

        <section className="box card">
          <h3><Icon name="copy" />团队上下文包</h3>
          <p>给不支持 MCP 的 AI 用：粘贴到 ChatGPT 自定义指令、Claude Project、DeepSeek / Gemini / Grok 对话开头，AI 就会按团队共识回答。插件里的「插入团队上下文」按钮做的是同一件事。</p>
          <ContextCopy projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </section>
      </div>

      <section className="box">
        <div className="box-h"><h2>支持的 AI</h2><span className="c">{WEB.length + 3} 个</span></div>
        <div className="grid pad">
          {[...WEB, "claudecode", "cursor", "copilot"].map((k) => {
            const s = SOURCES[k as SourceKey];
            return (
              <div key={k} className="row" style={{ gap: 10 }}>
                <Source s={k} only xl />
                <div><b style={{ fontWeight: 500 }}>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>{WEB.includes(k as SourceKey) ? "浏览器插件 · 粘贴导入" : s.how}</div></div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
