import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listProjects } from "@/lib/core";
import { aiEnabled } from "@/lib/ai";
import { ImportForm } from "@/components/import-form";

export const metadata = { title: "导入对话" };
export const maxDuration = 60;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const projects = await listProjects();
  return (
    <>
      <div className="ph">
        <div>
          <h1>导入 AI 对话</h1>
          <p>粘贴你和任何 AI 的对话。SimReal 会提炼出决策、任务、洞察和待定问题，先放进你的收件箱，由你确认后再发布给团队。</p>
        </div>
      </div>
      {!aiEnabled() ? (
        <div className="note warn">还没有配置 AI 提炼（ANTHROPIC_API_KEY），现在用的是规则提取，效果有限。管理员在 Vercel 环境变量里加上即可。</div>
      ) : null}
      <ImportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} initial={{ title: sp.title ?? "", text: sp.text ?? "", url: sp.url ?? "" }} />
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        不想每次复制粘贴？<Link className="link" href="/connect">安装浏览器插件</Link>，在 ChatGPT、Claude、DeepSeek、Gemini、Grok 页面一键同步。
      </p>
    </>
  );
}
