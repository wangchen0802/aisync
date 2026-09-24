// Claude Code SessionEnd hook: sends the finished session's transcript to the SimReal inbox.
export const SCRIPT = (url: string, token: string) => `#!/usr/bin/env node
// SimReal Sync — Claude Code SessionEnd hook. Sends each finished session to your SimReal inbox.
// Save as ~/.claude/hooks/simreal-sync.mjs and register it in ~/.claude/settings.json (see SimReal → 连接 AI).
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const SIMREAL_URL = process.env.SIMREAL_URL || ${JSON.stringify(url)};
const SIMREAL_TOKEN = process.env.SIMREAL_TOKEN || ${JSON.stringify(token)};
const MIN_CHARS = 400;

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\\n");
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (!input.transcript_path) process.exit(0);
  const lines = readFileSync(input.transcript_path, "utf8").split("\\n").filter(Boolean);
  const turns = [];
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.isMeta || e.isSidechain) continue;
    const role = e.type === "user" ? "我" : e.type === "assistant" ? "Claude" : null;
    if (!role || !e.message) continue;
    const t = textOf(e.message.content).trim();
    if (!t || t.startsWith("<command-") || t.startsWith("<local-command")) continue;
    turns.push(\`【\${role}】\\n\${t.slice(0, 4000)}\`);
  }
  const text = turns.join("\\n\\n---\\n\\n");
  if (text.length < MIN_CHARS) process.exit(0);
  const project = basename(input.cwd || process.cwd());
  const res = await fetch(SIMREAL_URL + "/api/ingest", {
    method: "POST",
    headers: { authorization: "Bearer " + SIMREAL_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ source: "claudecode", title: \`Claude Code · \${project}\`, external_key: input.session_id ? "claudecode:" + input.session_id : undefined, text: text.slice(-300000) }),
    signal: AbortSignal.timeout(55000),
  });
  if (res.ok) {
    const d = await res.json();
    console.error(\`SimReal: \${d.message} → \${d.auto ? d.team_url : d.review_url}\`);
  }
} catch {
  // Never block Claude Code on sync errors.
}
process.exit(0);
`;

