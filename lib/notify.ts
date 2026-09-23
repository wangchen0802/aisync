import "server-only";
import { getSetting } from "@/lib/core";
import { one } from "@/lib/db";

export type Channel = "slack" | "feishu" | "wecom";
export const CHANNEL_LABEL: Record<Channel, string> = { feishu: "Lark / 飞书", wecom: "企业微信", slack: "Slack" };

export async function webhooks(): Promise<Record<Channel, string>> {
  return {
    slack: (await getSetting("notify_slack", "")) || process.env.SLACK_WEBHOOK_URL || "",
    feishu: (await getSetting("notify_feishu", "")) || process.env.LARK_WEBHOOK_URL || "",
    wecom: await getSetting("notify_wecom", ""),
  };
}

export async function hasWebhook() {
  const w = await webhooks();
  return Boolean(w.slack || w.feishu || w.wecom);
}

export async function baseUrl() {
  return ((await getSetting("base_url", "")) || process.env.APP_URL || "").replace(/\/+$/, "");
}

/* ───────────── Lark message card ───────────── */

export function larkCard(title: string, lines: string[], link?: string, tone: "blue" | "red" | "green" | "orange" = "blue") {
  const elements: unknown[] = [];
  const body = lines.filter((l) => l !== undefined).join("\n").trim();
  if (body) elements.push({ tag: "div", text: { tag: "lark_md", content: body.slice(0, 3500) } });
  if (link) elements.push({ tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "在 SimReal 中打开" }, type: "primary", url: link }] });
  return { config: { wide_screen_mode: true }, header: { template: tone, title: { tag: "plain_text", content: title.slice(0, 120) } }, elements };
}

function toneOf(title: string) {
  return /冲突|逾期|⚠️/.test(title) ? "red" : /✅|达成共识|完成/.test(title) ? "green" : /截止|DDL|提醒/.test(title) ? "orange" : "blue";
}

async function post(channel: Channel, url: string, title: string, lines: string[], link?: string) {
  const body =
    channel === "slack"
      ? { text: `*${title}*\n${lines.join("\n")}${link ? `\n<${link}|在 SimReal 中打开>` : ""}` }
      : channel === "feishu"
        ? { msg_type: "interactive", card: larkCard(title, lines, link, toneOf(title)) }
        : { msgtype: "markdown", markdown: { content: `**${title}**\n${lines.join("\n")}${link ? `\n[在 SimReal 中打开](${link})` : ""}` } };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${CHANNEL_LABEL[channel]} 返回 ${res.status}`);
  // Lark and WeCom answer 200 with an error code in the body.
  const data = (await res.json().catch(() => null)) as { code?: number; StatusCode?: number; errcode?: number; msg?: string; errmsg?: string } | null;
  if (data && ((data.code ?? 0) !== 0 || (data.errcode ?? 0) !== 0 || (data.StatusCode ?? 0) !== 0)) throw new Error(`${CHANNEL_LABEL[channel]}：${data.msg ?? data.errmsg ?? "推送失败"}`);
}

/** Sends a short message to every configured team channel. Never throws. */
export async function notify(title: string, lines: string[] = [], path?: string) {
  try {
    const hooks = await webhooks();
    const base = await baseUrl();
    const link = path && base ? `${base}${path}` : undefined;
    await Promise.all(
      (Object.keys(hooks) as Channel[]).filter((c) => hooks[c]).map((c) => post(c, hooks[c], title, lines, link).catch((e) => console.error("notify", c, e))),
    );
  } catch (e) {
    console.error("notify failed", e);
  }
}

/** Like notify, but reports errors (used by the "send test" button and the digest). */
export async function notifyStrict(title: string, lines: string[], path?: string) {
  const hooks = await webhooks();
  const base = await baseUrl();
  const link = path && base ? `${base}${path}` : undefined;
  const on = (Object.keys(hooks) as Channel[]).filter((c) => hooks[c]);
  if (!on.length) throw new Error("还没有配置任何通知渠道（设置 → 团队通知）");
  await Promise.all(on.map((c) => post(c, hooks[c], title, lines, link)));
  return on;
}

/* ───────────── Lark app: personal DMs ───────────── */

export const lark = {
  domain: () => (process.env.LARK_DOMAIN || "https://open.larksuite.com").replace(/\/+$/, ""),
  configured: () => Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET),
};

const g = globalThis as unknown as { __larkToken?: { token: string; exp: number } };

async function tenantToken() {
  if (g.__larkToken && g.__larkToken.exp > Date.now() + 60_000) return g.__larkToken.token;
  const res = await fetch(`${lark.domain()}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json()) as { code: number; msg?: string; tenant_access_token?: string; expire?: number };
  if (data.code !== 0 || !data.tenant_access_token) throw new Error(`Lark token：${data.msg ?? data.code}`);
  g.__larkToken = { token: data.tenant_access_token, exp: Date.now() + (data.expire ?? 3600) * 1000 };
  return data.tenant_access_token;
}

export async function larkDM(openId: string, title: string, lines: string[], link?: string) {
  const token = await tenantToken();
  const res = await fetch(`${lark.domain()}/open-apis/im/v1/messages?receive_id_type=open_id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ receive_id: openId, msg_type: "interactive", content: JSON.stringify(larkCard(title, lines, link, toneOf(title))) }),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
  if (data.code !== 0) throw new Error(`Lark 私信：${data.msg ?? res.status}`);
}

/** Direct message to one teammate via the Lark app (if they signed in with Lark). Never throws. */
export async function dmUser(userId: number, title: string, lines: string[], path?: string) {
  try {
    if (!lark.configured()) return false;
    const u = await one<{ lark_open_id: string | null }>("select lark_open_id from users where id = $1", [userId]);
    if (!u?.lark_open_id) return false;
    const base = await baseUrl();
    await larkDM(u.lark_open_id, title, lines, path && base ? `${base}${path}` : undefined);
    return true;
  } catch (e) {
    console.error("dmUser failed", e);
    return false;
  }
}
