import { currentUser } from "@/auth";
import { ensureToken } from "@/lib/apitoken";
import { userFromRequest } from "@/lib/token";
import { SCRIPT } from "@/lib/hook-script";

const COMMAND = `---
description: 把这次会话里的决策、任务和进展同步到 SimReal 团队
---
整理本次会话里团队其他人需要知道的内容，然后调用 simreal 的 sync_conversation 工具。

- 先调用 get_my_work 看我进行中的任务。如果这次会话推进了其中某个，写进 task_updates（task_id 用 T-编号），不要重复建任务。
- items 只收：decision（已经做出的决定）、task（要做的事，写负责人和截止日期 YYYY-MM-DD）、insight（有复用价值的发现或数据）、question（需要团队拍板的问题）。
- 宁缺毋滥，通常 0–6 条，标题写结论本身。调试过程、试错、代码细节不要。
- text 里放 3–8 行本次会话的要点，作为存档。

$ARGUMENTS

同步后用一两句话告诉我同步了什么。
`;

// One-command setup for Claude Code: `curl -fsSL <url> -H "Authorization: Bearer sr_..." | node`
// Installs the SessionEnd sync hook, merges it into ~/.claude/settings.json, and registers the MCP server.
export async function GET(req: Request) {
  const me = (await userFromRequest(req)) ?? (await currentUser());
  if (!me) return new Response("console.error('SimReal: 密钥无效'); process.exit(1);", { status: 401, headers: { "content-type": "text/javascript" } });
  const token = await ensureToken(me.id);
  const origin = new URL(req.url).origin;
  const js = `
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), cp = require("node:child_process");
const dir = path.join(os.homedir(), ".claude"), hooks = path.join(dir, "hooks"), file = path.join(hooks, "simreal-sync.mjs"), settings = path.join(dir, "settings.json");
fs.mkdirSync(hooks, { recursive: true });
fs.writeFileSync(file, ${JSON.stringify(SCRIPT(origin, token))}, { mode: 0o700 });
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(settings, "utf8")); } catch {}
cfg.hooks = cfg.hooks || {};
const list = cfg.hooks.SessionEnd = cfg.hooks.SessionEnd || [];
const cmd = "node " + file;
if (!JSON.stringify(list).includes("simreal-sync.mjs")) list.push({ hooks: [{ type: "command", command: cmd, timeout: 60 }] });
fs.writeFileSync(settings, JSON.stringify(cfg, null, 2));
console.log("✓ 会话结束自动存档：" + file);
const cmds = path.join(dir, "commands");
fs.mkdirSync(cmds, { recursive: true });
fs.writeFileSync(path.join(cmds, "simreal.md"), ${JSON.stringify(COMMAND)});
console.log("✓ 命令已添加：/simreal（让 Claude 整理本次会话并同步给团队）");
try {
  cp.execFileSync("claude", ["mcp", "remove", "simreal", "--scope", "user"], { stdio: "ignore" });
} catch {}
try {
  cp.execFileSync("claude", ["mcp", "add", "--transport", "http", "--scope", "user", "simreal", ${JSON.stringify(`${origin}/api/mcp`)}, "--header", ${JSON.stringify(`Authorization: Bearer ${token}`)}], { stdio: "ignore" });
  console.log("✓ MCP 已添加：simreal");
} catch {
  console.log("! 没找到 claude 命令，MCP 需要手动添加（见 SimReal → 连接 AI）");
}
console.log("完成。重启 Claude Code 生效。");
`;
  return new Response(js, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
}
