import type { ItemRow } from "@/lib/core";
import { code } from "@/lib/meta";

/** Compact list of confirmed decisions, for pasting into any AI chat. */
export function contextPackText(decisions: ItemRow[]) {
  const ok = decisions.filter((d) => d.status === "confirmed");
  if (!ok.length) return "团队暂时还没有已确认的共识。";
  return `以下是我们团队已确认的共识，请在回答时遵循；如有冲突请指出编号：\n${ok
    .map((d) => `- [${code("decision", d.id)}] ${d.title}${d.body ? `（${d.body}）` : ""}${d.project_name ? ` · ${d.project_name}` : ""}`)
    .join("\n")}`;
}
