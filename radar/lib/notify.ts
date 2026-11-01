import "server-only";
import { getSetting } from "@/lib/db";

export type Channel = "feishu" | "slack" | "wecom";
export const CHANNEL_LABEL: Record<Channel, string> = { feishu: "Lark / 飞书", wecom: "企业微信", slack: "Slack" };

export async function webhooks(): Promise<Record<Channel, string>> {
  return {
    feishu: (await getSetting("notify_feishu", "")) || process.env.LARK_WEBHOOK_URL || "",
    slack: (await getSetting("notify_slack", "")) || process.env.SLACK_WEBHOOK_URL || "",
    wecom: await getSetting("notify_wecom", ""),
  };
}

export async function baseUrl() {
  return ((await getSetting("base_url", "")) || process.env.APP_URL || "").replace(/\/+$/, "");
}

function larkCard(title: string, md: string, link?: string) {
  const elements: unknown[] = [{ tag: "div", text: { tag: "lark_md", content: md.slice(0, 3800) } }];
  if (link) elements.push({ tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "打开需求雷达" }, type: "primary", url: link }] });
  return { config: { wide_screen_mode: true }, header: { template: "violet", title: { tag: "plain_text", content: title.slice(0, 120) } }, elements };
}

async function post(channel: Channel, url: string, title: string, md: string, link?: string) {
  const body =
    channel === "slack"
      ? { text: `*${title}*\n${md}${link ? `\n<${link}|打开需求雷达>` : ""}` }
      : channel === "feishu"
        ? { msg_type: "interactive", card: larkCard(title, md, link) }
        : { msgtype: "markdown", markdown: { content: `**${title}**\n${md.slice(0, 3800)}${link ? `\n[打开需求雷达](${link})` : ""}` } };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${CHANNEL_LABEL[channel]} 返回 ${res.status}`);
  const data = (await res.json().catch(() => null)) as { code?: number; StatusCode?: number; errcode?: number; msg?: string; errmsg?: string } | null;
  if (data && ((data.code ?? 0) !== 0 || (data.errcode ?? 0) !== 0 || (data.StatusCode ?? 0) !== 0)) throw new Error(`${CHANNEL_LABEL[channel]}：${data.msg ?? data.errmsg ?? "推送失败"}`);
}

/** Sends to every configured channel. Throws if none is configured or any fails. */
export async function notify(title: string, md: string, path = "/") {
  const hooks = await webhooks();
  const on = (Object.keys(hooks) as Channel[]).filter((c) => hooks[c]);
  if (!on.length) throw new Error("还没有配置通知渠道（设置 → 通知）");
  const base = await baseUrl();
  await Promise.all(on.map((c) => post(c, hooks[c], title, md, base ? `${base}${path}` : undefined)));
  return on;
}

/** Same, but never throws (cron alerts). */
export async function notifyQuiet(title: string, md: string, path = "/") {
  try {
    return await notify(title, md, path);
  } catch (e) {
    console.error("notify", e);
    return [];
  }
}
