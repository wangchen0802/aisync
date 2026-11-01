import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { authProviders, currentUser, signIn } from "@/auth";
import { dbConfigured } from "@/lib/db";
import { LogoMark } from "@/components/ui";

export const dynamic = "force-dynamic";

async function passcodeLogin(form: FormData) {
  "use server";
  try {
    await signIn("passcode", { name: form.get("name"), email: form.get("email"), passcode: form.get("passcode"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=passcode");
    throw e;
  }
}

async function googleLogin() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const ready = dbConfigured() && Boolean(process.env.AUTH_SECRET);
  if (ready && (await currentUser().catch(() => null))) redirect("/");
  const none = !authProviders.google && !authProviders.passcode;
  return (
    <div className="login">
      <div className="login-l">
        <div className="row" style={{ gap: 10 }}><LogoMark size={30} /><b style={{ fontSize: 16 }}>需求雷达</b></div>
        <div>
          <h1>谁在买什么数据、什么 RL 环境——每天自动看一遍。</h1>
          <p>数据商和实验室的岗位变化、X、Reddit、HN、论文、开源和新闻，汇成一个需求信号流，按领域看趋势，团队一起做判断。</p>
        </div>
        {!ready ? (
          <div className="note warn" style={{ maxWidth: 420 }}>
            还没配置完：需要 {!dbConfigured() ? "DATABASE_URL（Postgres）" : ""}{!dbConfigured() && !process.env.AUTH_SECRET ? " 和 " : ""}{!process.env.AUTH_SECRET ? "AUTH_SECRET" : ""}。见 README 的部署步骤。
          </div>
        ) : none ? (
          <div className="note warn" style={{ maxWidth: 420 }}>还没有开启任何登录方式：设置 TEAM_PASSCODE，或 AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET。</div>
        ) : (
          <div className="login-form">
            {authProviders.google ? (
              <form action={googleLogin}><button className="oauth" type="submit">使用 Google 登录</button></form>
            ) : null}
            {authProviders.google && authProviders.passcode ? <div className="or">或</div> : null}
            {authProviders.passcode ? (
              <form action={passcodeLogin} className="stack" style={{ gap: 8 }}>
                <input className="input" name="name" placeholder="你的名字" required />
                <input className="input" name="email" type="email" placeholder="工作邮箱" required />
                <input className="input" name="passcode" type="password" placeholder="团队口令" required />
                <button className="btn pri lg" type="submit">进入</button>
              </form>
            ) : null}
            {sp.error ? <div className="note err">{sp.error === "passcode" ? "口令不对，或邮箱不在允许的域名里" : "登录失败，请重试"}</div> : null}
          </div>
        )}
        <p className="fine">第一个登录的人自动成为管理员。</p>
      </div>
      <div className="login-r">
        <div className="grid-bg" />
        <div className="preview">
          {[
            ["岗位", "Scale AI 新增 14 个物理 / 化学专家岗，$60–90/h"],
            ["X", "某实验室研究员：在找企业 SaaS 的 computer-use 环境供应商"],
            ["Reddit", "r/outlier_ai：编程类项目本周明显变多"],
            ["论文", "10k 个可验证编程环境的训练配方"],
          ].map(([k, v]) => (
            <div key={v} className="box"><span className="faint" style={{ fontSize: 11.5 }}>{k}</span><span>{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
