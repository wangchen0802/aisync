"use client";

import { useState, useTransition } from "react";
import { saveNotifications, setAutoPublish, testNotification } from "@/lib/actions";
import { report } from "@/components/client";

export function AutoPublishToggle({ on, compact }: { on: boolean; compact?: boolean }) {
  const [v, setV] = useState(on);
  const [pending, start] = useTransition();
  const flip = () => { const n = !v; setV(n); start(async () => { const r = await setAutoPublish(n); report(r); if (!r.ok) setV(!n); }); };
  return (
    <div className={`auto-pub${compact ? " compact" : ""}`}>
      <div>
        <b>自动发布</b>
        <p>跳过收件箱，敏感条目除外</p>
      </div>
      <button className="sw" role="switch" aria-checked={v} aria-label="同步后自动发布" disabled={pending} onClick={flip} />
    </div>
  );
}

export function NotifyForm({ slack, feishu, wecom, disabled }: { slack: string; feishu: string; wecom: string; disabled: boolean }) {
  const [v, setV] = useState({ slack, feishu, wecom });
  const [pending, start] = useTransition();
  const field = (k: keyof typeof v, label: string, ph: string, help: string) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="url" value={v[k]} placeholder={ph} disabled={disabled} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
      <small>{help}</small>
    </label>
  );
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); start(async () => report(await saveNotifications(v))); }}>
      {field("feishu", "Lark / 飞书群机器人", "https://open.larksuite.com/open-apis/bot/v2/hook/...", "群设置 → 机器人 → 自定义机器人")}
      {field("wecom", "企业微信群机器人", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...", "群聊 → … → 群机器人")}
      {field("slack", "Slack Incoming Webhook", "https://hooks.slack.com/services/...", "Slack App → Incoming Webhooks")}
      <div className="row">
        <button className="btn pri" disabled={disabled || pending}>保存</button>
        <button type="button" className="btn" disabled={pending} onClick={() => start(async () => report(await testNotification()))}>发测试消息</button>
      </div>
    </form>
  );
}
