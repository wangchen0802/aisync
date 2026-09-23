const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get(["url", "token"]);
  const base = self.SIMREAL_CONFIG || {};
  $("url").value = s.url || base.url || "";
  $("token").value = s.token || base.token || "";
  if ($("url").value && $("token").value) test();
}

async function test() {
  const url = $("url").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  $("status").textContent = "正在连接…";
  try {
    const r = await fetch(url + "/api/context", { headers: { authorization: "Bearer " + token } });
    if (r.status === 401) throw new Error("个人密钥无效");
    if (!r.ok) throw new Error("连接失败（" + r.status + "）");
    $("dot").className = "dot ok";
    $("status").textContent = "已连接 ✓";
  } catch (e) {
    $("dot").className = "dot bad";
    $("status").textContent = e.message || "连接失败";
  }
}

$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({ url: $("url").value.trim().replace(/\/+$/, ""), token: $("token").value.trim() });
  test();
});
$("open").addEventListener("click", () => {
  const url = $("url").value.trim();
  if (url) chrome.tabs.create({ url });
});
load();
