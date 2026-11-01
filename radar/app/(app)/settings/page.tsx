import { headers } from "next/headers";
import { ensureToken } from "@/auth";
import { aiEnabled } from "@/lib/ai";
import { classifyNow, reclassifyAll, resetMyToken, restoreDefaultTopics } from "@/lib/actions";
import { getSetting, q } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ActionButton, CopyButton } from "@/components/client";
import { BookmarkletLink, NewTopic, SettingsForm, TestNotify, TopicRow } from "@/components/settings";
import { timeAgo } from "@/components/ui";

export const metadata = { title: "设置" };

export default async function Settings() {
  const me = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const base = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const token = await ensureToken(me.id);
  const keys = ["min_relevance", "alert_min_relevance", "alerts", "brief_send", "brief_focus", "workspace_name", "notify_feishu", "notify_slack", "notify_wecom"];
  const [values, topics, users] = await Promise.all([
    Promise.all(keys.map(async (k) => [k, await getSetting(k, { min_relevance: "35", alert_min_relevance: "75", alerts: "on", brief_send: "on", workspace_name: "SimReal" }[k] ?? "")] as const)),
    q<{ key: string; label: string; grp: string; keywords: string[]; archived: boolean }>("select key, label, grp, keywords, archived from rd_topics order by archived, grp desc, sort"),
    q<{ id: number; name: string; email: string; role: string; created_at: string }>("select id, coalesce(name, email) as name, email, role, created_at from rd_users order by id"),
  ]);
  const v = Object.fromEntries(values);
  const bookmarklet = `javascript:(()=>{const s=String(window.getSelection()||'').slice(0,6000);window.open('${base}/capture?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title)+'&s='+encodeURIComponent(s),'radar','width=620,height=760')})()`;
  const mcpUrl = `${base}/api/mcp/${token}`;
  const curl = `curl -X POST ${base}/api/capture \\\n  -H "Authorization: Bearer ${token}" -H "content-type: application/json" \\\n  -d '{"url":"https://x.com/…","text":"我们在找医疗 CoT 数据供应商","note":"客户 A 在问"}'`;

  return (
    <>
      <div className="ph"><div><h1>设置</h1><p>相关度阈值、通知、收录书签、连接 Claude，以及分类用的主题词。</p></div></div>

      <section className="box" id="general">
        <div className="box-h"><h2>相关度与周报</h2></div>
        <SettingsForm initial={v} keys={[
          { key: "min_relevance", label: "信号最低相关度", help: "0–100，低于它的信号默认不显示、不进统计", type: "number" },
          { key: "alert_min_relevance", label: "即时提醒的相关度", help: "每次抓取后，高于它的新信号推到群里", type: "number" },
          { key: "alerts", label: "抓取后推送提醒", type: "toggle" },
          { key: "brief_send", label: "周一自动发周报", type: "toggle" },
          { key: "brief_focus", label: "我们的重点（写进 AI 周报的提示）", type: "textarea", placeholder: "例如：我们做编程和 computer-use 的 RL 环境，主要客户是美国前沿实验室，也想看中国实验室的机会" },
          { key: "workspace_name", label: "团队名称" },
        ]} />
      </section>

      <section className="box" id="notify">
        <div className="box-h"><h2>通知</h2><TestNotify /></div>
        <SettingsForm initial={v} keys={[
          { key: "notify_feishu", label: "Lark / 飞书群机器人 Webhook", placeholder: "https://open.larksuite.com/open-apis/bot/v2/hook/…" },
          { key: "notify_slack", label: "Slack Incoming Webhook", placeholder: "https://hooks.slack.com/services/…" },
          { key: "notify_wecom", label: "企业微信群机器人 Webhook", placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…" },
        ]} />
      </section>

      <section className="box" id="capture">
        <div className="box-h"><h2>收录书签 · 连接 Claude / ChatGPT</h2><ActionButton className="btn sm ghost" action={resetMyToken} confirm="重置后旧的 MCP 地址和 API 调用会失效">重置我的密钥</ActionButton></div>
        <div className="pad stack">
          <div className="byo">
            <div className="byo-t"><b>收录书签</b><span className="muted">X、LinkedIn、Reddit、任何网页：选中一段文字（可选）→ 点书签 → 弹出收录窗口</span></div>
            <ol className="byo-s">
              <li>把这个按钮拖到浏览器书签栏：<BookmarkletLink code={bookmarklet}>＋ 收录到雷达</BookmarkletLink> 或 <CopyButton text={bookmarklet} label="复制书签代码" /></li>
              <li>没有 X API 也能用：在 X 上看到实验室研究员 / 创始人说在找某类数据或环境，点一下就收进来</li>
            </ol>
          </div>
          <div className="byo">
            <div className="byo-t"><b>Claude / ChatGPT 自定义连接器（MCP）</b><span className="muted">不需要 API Key：用你自己的订阅，在对话里直接问雷达</span></div>
            <div className="sub-url"><span className="mono">{mcpUrl}</span><CopyButton text={mcpUrl} /></div>
            <ol className="byo-s">
              <li>Claude：设置 → Connectors → Add custom connector，粘贴上面的地址。ChatGPT：设置 → Connectors（开发者模式）同理。Claude Code：<code className="mono">claude mcp add --transport http radar {mcpUrl}</code></li>
              <li>然后在对话里说：「看一下需求雷达，本周编程类 RL 环境需求有什么变化？」「把这条记到雷达：…」</li>
              <li>工具：search_signals、demand_report、topic_trends、listing_changes、list_themes、capture_signal、add_evidence</li>
            </ol>
          </div>
          <details className="more-d">
            <summary>API（脚本、快捷指令、其他系统写入）</summary>
            <pre className="code">{curl}</pre>
            <p className="muted" style={{ fontSize: 12 }}>只读上下文包：<code className="mono">GET {base}/api/context?days=7</code>（同样带 Authorization 头）</p>
          </details>
        </div>
      </section>

      <section className="box" id="topics">
        <div className="box-h">
          <h2>主题词 <span className="c">规则分类用；{aiEnabled() ? "配置了 Claude，新信号还会由 AI 复核" : "配置 ANTHROPIC_API_KEY 后由 AI 复核"}</span></h2>
          <span className="row" style={{ gap: 6 }}>
            <NewTopic />
            <ActionButton className="btn sm" action={reclassifyAll} pendingText="分类中…">用新关键词重新分类</ActionButton>
            {aiEnabled() ? <ActionButton className="btn sm" action={classifyNow} pendingText="分类中…">AI 分类待处理</ActionButton> : null}
            <ActionButton className="btn sm ghost" action={restoreDefaultTopics} confirm="恢复默认主题词？你改过的关键词会被覆盖">恢复默认</ActionButton>
          </span>
        </div>
        <p className="muted pad" style={{ margin: 0, fontSize: 12.5, paddingBottom: 0 }}>英文关键词按整词匹配（自动兼容复数、连字符和空格），中文按包含匹配。数据形态 = 买的是什么（RL 环境、SFT、偏好…），领域 = 为了什么能力（编程、医疗…）。</p>
        <div style={{ paddingTop: 6 }}>
          {topics.filter((t) => !t.archived).map((t) => <TopicRow key={t.key} t={t} />)}
        </div>
        {topics.some((t) => t.archived) ? <p className="muted pad" style={{ margin: 0, fontSize: 12 }}>已隐藏：{topics.filter((t) => t.archived).map((t) => t.label).join("、")}（在「新主题」里用同样的 key 重新添加即可恢复）</p> : null}
      </section>

      <section className="box">
        <div className="box-h"><h2>成员 <span className="c">{users.length}</span></h2></div>
        <ul className="mini">
          {users.map((u) => <li key={u.id}><span className="t"><b>{u.name}</b> <span className="muted">{u.email}</span></span><span className="s">{u.role === "admin" ? "管理员 · " : ""}{timeAgo(u.created_at)}加入</span></li>)}
        </ul>
      </section>
    </>
  );
}
