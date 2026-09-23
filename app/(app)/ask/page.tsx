import { requireUser } from "@/lib/session";
import { AskBox } from "@/components/ask-box";
import { aiEnabled } from "@/lib/ai";

export const metadata = { title: "问团队记忆" };
export const maxDuration = 60;

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q ?? "";
  return (
    <>
      <div className="ph">
        <div>
          <h1>问团队记忆</h1>
          <p>用自然语言提问，答案只来自团队已发布的共识、任务和洞察，并标出处。Claude Code、Cursor 通过 MCP 也能问同样的问题。</p>
        </div>
      </div>
      <AskBox initial={q} ai={aiEnabled()} />
    </>
  );
}
