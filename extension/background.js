importScripts("config.js");

async function getConfig() {
  const stored = await chrome.storage.sync.get(["url", "token"]);
  const base = self.SIMREAL_CONFIG || {};
  return {
    url: (stored.url || base.url || "").replace(/\/+$/, ""),
    token: stored.token || base.token || "",
  };
}

async function api(path, init = {}) {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.token) throw new Error("还没有配置 SimReal 地址和个人密钥，点击浏览器工具栏里的 SimReal 图标设置。");
  const res = await fetch(cfg.url + path, {
    ...init,
    headers: { authorization: "Bearer " + cfg.token, "content-type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error((data && data.error) || "请求失败（" + res.status + "）");
  return data;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "sync") reply({ ok: true, data: await api("/api/ingest", { method: "POST", body: JSON.stringify(msg.payload) }) });
      else if (msg.type === "prompt") reply({ ok: true, data: await api("/api/distill-prompt?url=" + encodeURIComponent(msg.url || ""), { method: "GET" }) });
      else if (msg.type === "context") {
        const qs = new URLSearchParams();
        if (msg.topic) qs.set("topic", msg.topic);
        if (msg.project) qs.set("project", msg.project);
        reply({ ok: true, data: await api("/api/context" + (qs.toString() ? "?" + qs : ""), { method: "GET" }) });
      }
      else if (msg.type === "config") reply({ ok: true, data: await getConfig() });
    } catch (e) {
      reply({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "sync-current") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "trigger-sync" }).catch(() => {});
});
