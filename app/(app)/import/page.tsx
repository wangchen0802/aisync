import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listProjects } from "@/lib/core";
import { aiEnabled } from "@/lib/ai";
import { ImportForm } from "@/components/import-form";
import { buildDistillPrompt } from "@/lib/selfdistill";

export const metadata = { title: "导入对话" };
export const maxDuration = 120;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [projects, prompt] = await Promise.all([listProjects(), aiEnabled() ? Promise.resolve(undefined) : buildDistillPrompt(me)]);
  return (
    <>
      <div className="ph">
        <div>
          <h1>导入对话</h1>
        </div>
      </div>
      <ImportForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} initial={{ title: sp.title ?? "", text: sp.text ?? "", url: sp.url ?? "" }} selfPrompt={prompt} />
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
        更省事：在 Claude / ChatGPT 里添加 SimReal 连接器，或装<Link className="link" href="/connect">浏览器插件</Link>，一键完成上面两步。
      </p>
    </>
  );
}
