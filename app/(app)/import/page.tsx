import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listProjects } from "@/lib/core";
import { aiEnabled } from "@/lib/ai";
import { ImportForm } from "@/components/import-form";

export const metadata = { title: "导入对话" };
export const maxDuration = 120;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const projects = await listProjects();
  return (
    <>
      <div className="ph">
        <div>
          <h1>导入对话</h1>
        </div>
      </div>
      {!aiEnabled() ? (
        <div className="note warn">未配置 ANTHROPIC_API_KEY，当前用规则提取，准确度有限。</div>
      ) : null}
      <ImportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} initial={{ title: sp.title ?? "", text: sp.text ?? "", url: sp.url ?? "" }} />
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        装上<Link className="link" href="/connect">浏览器插件</Link>后，在 AI 页面按 Alt+Shift+S 直接同步。
      </p>
    </>
  );
}
