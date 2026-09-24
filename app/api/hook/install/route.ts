import { currentUser } from "@/auth";
import { ensureToken } from "@/lib/apitoken";
import { userFromRequest } from "@/lib/token";
import { SCRIPT } from "@/lib/hook-script";

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
console.log("✓ 自动同步已安装：" + file);
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
