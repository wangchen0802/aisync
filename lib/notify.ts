import "server-only";
import { getSetting } from "@/lib/core";

export type Channel = "slack" | "feishu" | "wecom";

export async function webhooks(): Promise<Record<Channel, string>> {
  return {
    slack: (await getSetting("notify_slack", "")) || process.env.SLACK_WEBHOOK_URL || "",
    feishu: await getSetting("notify_feishu", ""),
    wecom: await getSetting("notify_wecom", ""),
  };
}

export async function hasWebhook() {
  const w = await webhooks();
  return Boolean(w.slack || w.feishu || w.wecom);
}

export async function baseUrl() {
  return (await getSetting("base_url", "")).replace(/\/+$/, "");
}

async function post(channel: Channel, url: string, title: string, lines: string[], link?: string) {
  const text = [title, ...lines].join("\n");
  const body =
    channel === "slack"
      ? { text: `*${title}*\n${lines.join("\n")}${link ? `\n<${link}|在 SimReal 中打开>` : ""}` }
      : channel === "feishu"
        ? { msg_type: "text", content: { text: `${text}${link ? `\n${link}` : ""}` } }
        : { msgtype: "markdown", markdown: { content: `**${title}**\n${lines.join("\n")}${link ? `\n[在 SimReal 中打开](${link})` : ""}` } };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${channel} 返回 ${res.status}`);
  // Feishu and WeCom return 200 with an error code in the body.
  const data = (await res.json().catch(() => null)) as { code?: number; errcode?: number; msg?: string; errmsg?: string } | null;
  if (data && ((data.code ?? 0) !== 0 || (data.errcode ?? 0) !== 0)) throw new Error(`${channel}：${data.msg ?? data.errmsg ?? "推送失败"}`);
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
  if (!on.length) throw new Error("还没有配置任何通知渠道（设置 → 通知）");
  await Promise.all(on.map((c) => post(c, hooks[c], title, lines, link)));
  return on;
}
