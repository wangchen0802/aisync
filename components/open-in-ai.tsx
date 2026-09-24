"use client";

import { toast } from "@/components/client";
import { Icon } from "@/components/ui";

// Prefilled chats. Both sites read ?q=; very long prompts go through the clipboard instead.
const TARGETS = [
  { key: "chatgpt", label: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${q}`, home: "https://chatgpt.com/" },
  { key: "claude", label: "Claude", url: (q: string) => `https://claude.ai/new?q=${q}`, home: "https://claude.ai/new" },
] as const;
const MAX_URL = 7000;

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Hands a ready-made prompt to the user's own ChatGPT / Claude (subscription — no API key involved). */
export function OpenInAI({ prompt, label = "在这里继续：" }: { prompt: string; label?: string }) {
  const open = async (t: (typeof TARGETS)[number]) => {
    const q = encodeURIComponent(prompt);
    if (q.length <= MAX_URL) { window.open(t.url(q), "_blank", "noopener"); return; }
    const w = window.open(t.home, "_blank", "noopener");
    toast((await copy(prompt)) ? `内容较长，已复制，在 ${t.label} 里粘贴即可` : "复制失败，请手动复制", !w);
  };
  return (
    <div className="row open-ai">
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      {TARGETS.map((t) => <button key={t.key} type="button" className="btn sm" onClick={() => open(t)}><Icon name="send" />{t.label}</button>)}
      <button type="button" className="btn sm ghost" onClick={async () => toast((await copy(prompt)) ? "已复制，粘贴给任何 AI" : "复制失败", false)}><Icon name="copy" />复制</button>
    </div>
  );
}
