import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, authProviders, signIn } from "@/auth";
import { dbConfigured } from "@/lib/db";
import { Icon, LogoMark } from "@/components/ui";

export const metadata = { title: "登录" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "口令不对，或者邮箱不在允许的范围内。",
  AccessDenied: "这个账号还没有被邀请。请让管理员在「设置 → 成员」里邀请你的邮箱，或使用团队口令登录。",
  Configuration: "登录配置有误，请检查 AUTH_SECRET 和登录方式的环境变量。",
  Lark: "Lark 登录失败：请确认 Lark 应用已发布、回调地址已配置，且开通了获取用户信息的权限。",
  LarkState: "登录请求已过期，请重新点击「使用 Lark 登录」。",
};

async function passcodeLogin(form: FormData) {
  "use server";
  try {
    await signIn("passcode", { name: form.get("name"), email: form.get("email"), passcode: form.get("passcode"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) redirect(`/login?error=${e.type === "CredentialsSignin" ? "CredentialsSignin" : "Configuration"}`);
    throw e;
  }
}
async function google() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}
async function github() {
  "use server";
  await signIn("github", { redirectTo: "/" });
}

function Setup() {
  return (
    <div className="stack" style={{ maxWidth: 440 }}>
      <div className="note warn">还差一步配置，团队才能登录。</div>
      <ol className="ol">
        {!dbConfigured() ? <li>在 Vercel 项目的 <b>Storage</b> 里创建一个 <b>Neon (Postgres)</b> 数据库并连接到这个项目（会自动设置 <span className="mono">DATABASE_URL</span>）。</li> : null}
        {!process.env.AUTH_SECRET ? <li>在 <b>Settings → Environment Variables</b> 添加 <span className="mono">AUTH_SECRET</span>（任意 32 位以上随机字符串）。</li> : null}
        {!authProviders.google && !authProviders.github && !authProviders.passcode ? (
          <li>至少开启一种登录方式：推荐配置 Lark 登录 <span className="mono">LARK_APP_ID</span> / <span className="mono">LARK_APP_SECRET</span>；最快的是添加 <span className="mono">TEAM_PASSCODE</span>（团队口令）；也可以配置 Google 登录 <span className="mono">AUTH_GOOGLE_ID</span> / <span className="mono">AUTH_GOOGLE_SECRET</span>。</li>
        ) : null}
        <li>保存后在 Vercel 点 <b>Redeploy</b>。</li>
      </ol>
      <p className="fine">详细步骤见仓库里的 README。</p>
    </div>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ready = dbConfigured() && Boolean(process.env.AUTH_SECRET) && (authProviders.lark || authProviders.google || authProviders.github || authProviders.passcode);
  if (ready && (await auth())?.user) redirect("/");
  const { error } = await searchParams;
  const oauth = authProviders.lark || authProviders.google || authProviders.github;

  return (
    <div className="login">
      <div className="login-l">
        <div className="row" style={{ gap: 10 }}>
          <LogoMark size={30} />
          <b style={{ fontSize: 16, letterSpacing: "-0.01em" }}>SimReal Sync</b>
        </div>
        <div>
          <h1>让每个人的 AI，<br />都知道团队在想什么</h1>
          <p>大家在 ChatGPT、Claude、DeepSeek、Gemini、Grok 里的对话，自动变成团队看得见的共识和任务进度。</p>
        </div>
        {!ready ? <Setup /> : (
          <div className="login-form">
            {error ? <div className="note err">{ERRORS[error] ?? "登录失败，请重试。"}</div> : null}
            {authProviders.lark ? (
              <a className="oauth lark" href="/api/lark/login">
                <span className="lark-mark" aria-hidden="true">L</span>
                使用 Lark 登录
              </a>
            ) : null}
            {authProviders.google ? (
              <form action={google}>
                <button className="oauth">
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                  使用 Google 登录
                </button>
              </form>
            ) : null}
            {authProviders.github ? (
              <form action={github}>
                <button className="oauth">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  使用 GitHub 登录
                </button>
              </form>
            ) : null}
            {authProviders.passcode ? (
              <>
                {oauth ? <div className="or">或使用团队口令</div> : null}
                <form action={passcodeLogin} className="stack" style={{ gap: 8 }}>
                  <input className="input" name="name" placeholder="你的名字" required autoComplete="name" />
                  <input className="input" name="email" type="email" placeholder="工作邮箱" required autoComplete="email" />
                  <input className="input" name="passcode" type="password" placeholder="团队口令（向管理员要）" required autoComplete="current-password" />
                  <button className="btn pri lg">进入工作区</button>
                </form>
              </>
            ) : null}
            <p className="fine">登录后，通过浏览器插件和 MCP 把你的 ChatGPT、Claude、DeepSeek、Gemini、Grok 连接进来。</p>
          </div>
        )}
      </div>
      <div className="login-r" aria-hidden="true">
        <div className="grid-bg" />
        <div className="preview">
          <div className="box">
            <div className="meta"><span className="ref">D-24</span><span className="tag s-confirmed">已确认</span><span className="pv"><i style={{ background: "#B8603F" }}>CC</i>Claude Code</span></div>
            <b style={{ fontWeight: 500 }}>支付走 Stripe Checkout，不自建支付表单</b>
            <span className="muted" style={{ fontSize: 12.5 }}>PCI 合规成本低；团队只有 1 名后端。3/3 已确认</span>
          </div>
          <div className="box" style={{ marginLeft: 28 }}>
            <div className="meta"><span className="ref">D-23</span><span className="tag s-conflict">有冲突</span><span className="pv"><i style={{ background: "#10A37F" }}>GP</i>ChatGPT</span><span className="pv"><i style={{ background: "#4D6BFE" }}>DS</i>DeepSeek</span></div>
            <b style={{ fontWeight: 500 }}>定价：$12/人/月 vs 竞品均价建议 ≥ $15</b>
          </div>
          <div className="box">
            <div className="meta"><span className="ref">T-41</span><span className="tag s-doing">进行中</span><span className="pv"><i style={{ background: "#18181B" }}>Cu</i>Cursor</span></div>
            <b style={{ fontWeight: 500 }}>结算页 + 成功/失败回跳页面</b>
            <div className="row" style={{ gap: 8 }}><div className="prog"><span style={{ width: "60%" }} /></div><span className="ref">3/5</span></div>
            <span className="muted" style={{ fontSize: 12 }}><Icon name="clock" className="i sm" /> 12 分钟前 · 完成了 /cancel 页面</span>
          </div>
        </div>
      </div>
    </div>
  );
}
