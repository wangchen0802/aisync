(() => {
  if (window.__simrealSync) return;
  window.__simrealSync = true;

  const host = location.host;
  const SOURCE =
    /chatgpt\.com|openai\.com/.test(host) ? "chatgpt" :
    /claude\.ai/.test(host) ? "claude" :
    /deepseek/.test(host) ? "deepseek" :
    /gemini\.google/.test(host) ? "gemini" :
    /grok\.com|x\.com/.test(host) ? "grok" :
    /perplexity/.test(host) ? "perplexity" :
    /kimi/.test(host) ? "kimi" :
    /doubao/.test(host) ? "doubao" :
    /tongyi|qwen/.test(host) ? "qwen" : "other";

  const clean = (s) => (s || "").replace(/\n{3,}/g, "\n\n").trim();

  // Per-site adapters return [{role, text}]. Selectors drift; everything falls back to the main pane text.
  const ADAPTERS = {
    chatgpt: () => [...document.querySelectorAll("[data-message-author-role]")].map((el) => ({ role: el.getAttribute("data-message-author-role"), text: el.innerText })),
    claude: () => [...document.querySelectorAll('[data-testid="user-message"], .font-claude-response, .font-claude-message')].map((el) => ({ role: el.matches('[data-testid="user-message"]') ? "user" : "assistant", text: el.innerText })),
    gemini: () => [...document.querySelectorAll("user-query, model-response")].map((el) => ({ role: el.tagName.toLowerCase() === "user-query" ? "user" : "assistant", text: el.innerText })),
    // DeepSeek uses hashed class names; the main-pane fallback is more reliable.
    deepseek: () => [],
    grok: () => [...document.querySelectorAll(".message-bubble")].map((el) => ({ role: el.closest('[class*="items-end"]') ? "user" : "assistant", text: el.innerText })),
  };

  let pendingSelection = "";
  function collect() {
    const sel = pendingSelection || String(window.getSelection() || "").trim();
    pendingSelection = "";
    if (sel.length > 80) return { text: sel, partial: true };
    let msgs = [];
    try { msgs = (ADAPTERS[SOURCE] || (() => []))().filter((m) => clean(m.text)); } catch { msgs = []; }
    if (msgs.length >= 2) {
      return { text: msgs.map((m) => (m.role === "user" ? "【我】\n" : "【AI】\n") + clean(m.text)).join("\n\n---\n\n"), count: msgs.length };
    }
    const main = document.querySelector("main") || document.body;
    return { text: clean(main.innerText), count: 0 };
  }

  function title() {
    return (document.title || "").replace(/\s*[-|–]\s*(ChatGPT|Claude|DeepSeek|Gemini|Grok|Perplexity|Kimi|豆包|通义).*$/i, "").trim().slice(0, 120);
  }

  function findInput() {
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.isContentEditable)) return a;
    const cands = [...document.querySelectorAll('#prompt-textarea, div[contenteditable="true"], .ql-editor[contenteditable], textarea')];
    return cands.find((el) => el.offsetParent !== null) || null;
  }

  function insertText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text + (el.value ? "\n\n" + el.value : ""));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
      if (!document.execCommand("insertText", false, text + "\n\n")) el.textContent = text + "\n\n" + el.textContent;
    }
  }

  /* ───────── floating widget (shadow DOM keeps page CSS out) ───────── */
  const hostEl = document.createElement("div");
  hostEl.style.cssText = "position:fixed;right:18px;bottom:96px;z-index:2147483646;";
  const root = hostEl.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host{all:initial}
    .w{font:500 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    .bar{display:flex;align-items:center;gap:2px;background:#0B0B0F;color:#fff;border-radius:12px;padding:3px;box-shadow:0 8px 28px -6px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.06)}
    button{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:9px;color:#fff;white-space:nowrap}
    button:hover{background:rgba(255,255,255,.1)}
    button:focus-visible{outline:2px solid #7C9BFF}
    .logo{width:20px;height:20px;border-radius:6px;background:#fff;display:grid;place-items:center;padding:0;margin:0 2px 0 4px}
    .sep{width:1px;height:16px;background:rgba(255,255,255,.14)}
    .toast{max-width:280px;background:#fff;color:#0B0B0F;border-radius:10px;padding:10px 12px;box-shadow:0 8px 28px -6px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.06);line-height:1.45}
    .toast a{color:#3451B2;font-weight:600;text-decoration:none}
    .toast.err{color:#B42318}
    .min .label{display:none}
  </style>
  <div class="w">
    <div class="toast" hidden></div>
    <div class="bar">
      <span class="logo" title="SimReal Sync"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="12" height="12" rx="3.5" fill="#0B0B0F"/><rect x="9" y="9" width="12" height="12" rx="3.5" stroke="#0B0B0F" stroke-width="2.2"/></svg></span>
      <button class="sync" title="同步当前对话到 SimReal（Alt+Shift+S）"><span>⇪</span><span class="label">同步到团队</span></button>
      <span class="sep"></span>
      <button class="ctx" title="把团队共识插入输入框"><span>⤓</span><span class="label">插入团队上下文</span></button>
    </div>
  </div>`;
  const toastEl = root.querySelector(".toast");
  let t;
  function toast(html, err) {
    if (err) toastEl.textContent = html;
    else toastEl.innerHTML = html;
    toastEl.className = "toast" + (err ? " err" : "");
    toastEl.hidden = false;
    clearTimeout(t);
    t = setTimeout(() => (toastEl.hidden = true), err ? 7000 : 6000);
  }
  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError?.message || "扩展未响应，请刷新页面" })));

  /* ───────── "use my own AI": the page's AI extracts, we only parse its JSON ───────── */
  const END = "【SimReal 指令结束】";
  const MARKER = '"simreal_sync"';
  const pageText = () => (document.querySelector("main") || document.body).innerText;

  function sliceJson(text, from) {
    const at = text.indexOf(MARKER, from);
    if (at < 0) return null;
    const start = text.lastIndexOf("{", at);
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i >= 0 && i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
      else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return { json: text.slice(start, i + 1), end: i + 1 };
    }
    return null;
  }
  /** The AI's reply to our prompt, if it is on the page and nothing much came after it. */
  function finishedReply(requireTail) {
    const text = pageText();
    const endAt = text.lastIndexOf(END);
    if (endAt < 0) return null;
    const hit = sliceJson(text, endAt + END.length);
    if (!hit) return null;
    if (requireTail && text.length - hit.end > 600) return null;
    try { return JSON.parse(hit.json); } catch { return null; }
  }

  function pressSend(input) {
    const btn = [...document.querySelectorAll('button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="发送"], button[type="submit"]')]
      .find((b) => b.offsetParent !== null && !b.disabled);
    if (btn) { btn.click(); return true; }
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    return false;
  }

  let watching = null;
  function watchReply(payload) {
    clearInterval(watching);
    let last = "", stable = 0, waited = 0;
    watching = setInterval(async () => {
      waited += 1500;
      const obj = finishedReply(false);
      const sig = obj ? JSON.stringify(obj) : "";
      stable = sig && sig === last ? stable + 1 : 0;
      last = sig;
      if (obj && stable >= 1) {
        clearInterval(watching);
        report(await send({ type: "sync", payload: { ...payload, distilled: obj } }), false);
      } else if (waited > 240000) {
        clearInterval(watching);
        toast("没等到 AI 的整理结果。回复出来后再点一次「同步到团队」", true);
      }
    }, 1500);
  }

  async function sync() {
    const c = collect();
    if (c.text.length < 40 && !finishedReply(true)) return toast("这页还没有对话内容", true);
    const payload = { source: SOURCE, title: title(), url: location.href, text: c.text };
    const cfg = await send({ type: "prompt", url: location.href });
    if (!cfg.ok) return toast(cfg.error, true);
    if (cfg.data.server_ai || c.partial) {
      toast("正在提炼…");
      return report(await send({ type: "sync", payload }), c.partial);
    }
    // Already asked earlier and the answer is the last thing on the page: sync it directly.
    const ready = finishedReply(true);
    if (ready) return report(await send({ type: "sync", payload: { ...payload, distilled: ready } }), false);
    const input = findInput();
    if (!input) {
      try { await navigator.clipboard.writeText(cfg.data.prompt); } catch { /* ignore */ }
      return toast("已复制整理指令。粘贴发给 AI，回复后再点「同步到团队」");
    }
    insertText(input, cfg.data.prompt);
    await new Promise((r) => setTimeout(r, 250));
    const sent = pressSend(input);
    toast(sent ? "已让 AI 整理要点，回复完成后自动同步…" : "已填好整理指令，按回车发送；回复完成后自动同步");
    watchReply(payload);
  }

  function report(r, partial) {
    if (!r.ok) return toast(r.error, true);
    const d = r.data;
    const esc = (x) => String(x).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const link = d.unchanged ? "" : d.auto && !d.pending ? `<a href="${esc(d.team_url)}" target="_blank" rel="noopener">查看团队动态 →</a>` : `<a href="${esc(d.review_url)}" target="_blank" rel="noopener">去收件箱审核 →</a>`;
    toast(`${d.unchanged ? "" : "✓ "}${esc(d.message)}${partial ? "（仅选中部分）" : ""}${link ? "<br>" + link : ""}`);
  }

  async function ctx() {
    const input = findInput();
    // The conversation title makes a good topic: related decisions and tasks come first.
    const r = await send({ type: "context", topic: title() });
    if (!r.ok) return toast(r.error, true);
    if (!input) {
      try { await navigator.clipboard.writeText(r.data); toast("没找到输入框，已复制到剪贴板"); } catch { toast("没找到输入框", true); }
      return;
    }
    insertText(input, r.data);
    toast("已插入团队上下文");
  }

  // Clicking the button can clear the page selection, so capture it first.
  root.querySelector(".sync").addEventListener("pointerdown", () => { pendingSelection = String(window.getSelection() || "").trim(); });
  root.querySelector(".sync").addEventListener("click", sync);
  root.querySelector(".ctx").addEventListener("click", ctx);
  chrome.runtime.onMessage.addListener((m) => { if (m.type === "trigger-sync") sync(); });

  const mount = () => document.body && !hostEl.isConnected && document.body.appendChild(hostEl);
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });
  if (innerWidth < 900) root.querySelector(".w").classList.add("min");
})();
