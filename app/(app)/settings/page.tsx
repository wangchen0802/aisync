import { requireUser } from "@/lib/session";
import { getSetting, listMembers, listProjects } from "@/lib/core";
import { authProviders } from "@/auth";
import { aiEnabled } from "@/lib/ai";
import { ago, PROJECT_COLORS } from "@/lib/meta";
import { archiveProject, removeMember, setMemberRole } from "@/lib/actions";
import { ActionButton } from "@/components/client";
import { InviteForm, ProfileForm, ProjectForm, WorkspaceForm } from "@/components/settings-forms";
import { Avatar } from "@/components/ui";
import { AutoPublishToggle, NotifyForm } from "@/components/prefs";
import { one } from "@/lib/db";

export const metadata = { title: "设置" };

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="it" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
      <div><b style={{ fontWeight: 500 }}>{label}</b><div className="muted" style={{ fontSize: 12 }}>{hint}</div></div>
      <span className={`tag ${ok ? "s-done" : "s-todo"}`}>{ok ? "已配置" : "未配置"}</span>
    </div>
  );
}

export default async function Settings() {
  const me = await requireUser();
  const [projects, members, ws, threshold] = await Promise.all([listProjects(true), listMembers(), getSetting("workspace_name", "SimReal"), getSetting("ack_threshold", "2")]);
  const admin = me.role === "admin";
  const [notifySlack, notifyFeishu, notifyWecom] = await Promise.all([getSetting("notify_slack", ""), getSetting("notify_feishu", ""), getSetting("notify_wecom", "")]);
  const auto = (await one<{ auto_publish: boolean }>("select auto_publish from users where id = $1", [me.id]))?.auto_publish ?? false;
  return (
    <>
      <div className="ph"><div><h1>设置</h1></div></div>

      <div className="two">
        <section className="box">
          <div className="box-h"><h2>我的资料</h2></div>
          <div className="pad"><ProfileForm name={me.name} email={me.email} /></div>
        </section>
        <section className="box">
          <div className="box-h"><h2>工作区</h2>{!admin ? <span className="c">仅管理员可修改</span> : null}</div>
          <div className="pad"><WorkspaceForm name={ws} threshold={Number(threshold) || 2} disabled={!admin} /></div>
        </section>
      </div>

      <section className="box">
        <div className="box-h"><h2>我的同步方式</h2></div>
        <div className="pad"><AutoPublishToggle on={auto} /></div>
      </section>

      <section className="box" id="notify">
        <div className="box-h"><h2>团队通知</h2><span className="c">{admin ? "新决策待确认、冲突、达成共识、每日简报" : "仅管理员可修改"}</span></div>
        <div className="pad"><NotifyForm slack={notifySlack} feishu={notifyFeishu} wecom={notifyWecom} disabled={!admin} /></div>
      </section>

      <section className="box" id="projects">
        <div className="box-h"><h2>项目 <span className="c">{projects.filter((p) => !p.archived).length}</span></h2></div>
        <div className="pad"><ProjectForm nextColor={PROJECT_COLORS[projects.length % 6]} /></div>
        <div className="list" style={{ borderTop: "1px solid var(--line)" }}>
          {projects.map((p) => (
            <div key={p.id} className="it" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", opacity: p.archived ? 0.55 : 1 }}>
              <ProjectForm project={{ id: p.id, name: p.name, description: p.description, color: p.color }} />
              <ActionButton className="btn sm ghost" action={archiveProject.bind(null, p.id, !p.archived)}>{p.archived ? "恢复" : "归档"}</ActionButton>
            </div>
          ))}
          {!projects.length ? <div className="empty"><p>暂无项目</p></div> : null}
        </div>
      </section>

      <section className="box" id="members">
        <div className="box-h"><h2>成员 <span className="c">{members.length}</span></h2></div>
        {admin ? <div className="pad"><InviteForm /></div> : null}
        <div className="list" style={{ borderTop: admin ? "1px solid var(--line)" : undefined }}>
          {members.map((m) => (
            <div key={m.id} className="it" style={{ gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar id={m.id} name={m.name} image={m.image} lg />
                <div>
                  <b style={{ fontWeight: 500 }}>{m.name}</b>{m.id === me.id ? <span className="muted">（我）</span> : null}
                  <div className="muted" style={{ fontSize: 12 }}>{m.email} · {m.invited ? "已邀请，未登录" : `加入于 ${ago(m.created_at)}`}{m.last_ingest_at ? ` · 最近同步 ${ago(m.last_ingest_at)}` : ""}</div>
                </div>
              </div>
              <div className="row">
                <span className={`tag ${m.role === "admin" ? "s-doing" : "s-todo"}`}>{m.role === "admin" ? "管理员" : "成员"}</span>
                {admin && m.id !== me.id ? (
                  <>
                    <ActionButton className="btn sm ghost" action={setMemberRole.bind(null, m.id, m.role === "admin" ? "member" : "admin")}>{m.role === "admin" ? "设为成员" : "设为管理员"}</ActionButton>
                    <ActionButton className="btn sm ghost danger" confirm={`移除 ${m.name}？`} action={removeMember.bind(null, m.id)}>移除</ActionButton>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="box">
        <div className="box-h"><h2>部署状态</h2><span className="c">在 Vercel → Settings → Environment Variables 修改</span></div>
        <div className="list">
          <Check ok label="数据库" hint="DATABASE_URL" />
          <Check ok={authProviders.lark} label="Lark 登录 + 个人私信提醒" hint="LARK_APP_ID / LARK_APP_SECRET（LARK_DOMAIN 默认 open.larksuite.com，飞书填 https://open.feishu.cn）" />
          <Check ok={authProviders.google} label="Google 登录" hint="AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET" />
          <Check ok={authProviders.github} label="GitHub 登录" hint="AUTH_GITHUB_ID / AUTH_GITHUB_SECRET" />
          <Check ok={authProviders.passcode} label="团队口令登录" hint="TEAM_PASSCODE" />
          <Check ok={Boolean(process.env.ALLOWED_EMAIL_DOMAINS)} label="允许的邮箱域名" hint={process.env.ALLOWED_EMAIL_DOMAINS || "ALLOWED_EMAIL_DOMAINS，例如 simreal.ai"} />
          <Check ok={aiEnabled()} label="AI 提炼（Claude）" hint={`ANTHROPIC_API_KEY · 模型 ${process.env.ANTHROPIC_MODEL || "claude-opus-5"}`} />
          <Check ok={Boolean(notifySlack || notifyFeishu || notifyWecom || process.env.SLACK_WEBHOOK_URL)} label="团队通知渠道" hint="在上方「团队通知」里配置飞书 / 企业微信 / Slack" />
          <Check ok={Boolean(process.env.CRON_SECRET)} label="定时提醒" hint="CRON_SECRET：工作日 9:00 私信每人的 DDL 与待确认，周一发本周目标，18:00 发每日简报" />
        </div>
      </section>
    </>
  );
}
