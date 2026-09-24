import { requireUser } from "@/lib/session";
import { AskBox } from "@/components/ask-box";
import { aiEnabled } from "@/lib/ai";

export const metadata = { title: "问团队记忆" };
export const maxDuration = 120;

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const q = (await searchParams).q ?? "";
  return (
    <>
      <div className="ph">
        <div>
          <h1>问团队记忆</h1>
        </div>
      </div>
      <AskBox initial={q} ai={aiEnabled()} />
    </>
  );
}
