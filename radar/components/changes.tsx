import Link from "next/link";
import { fmtPay } from "@/lib/format";
import type { Change } from "@/lib/trends";
import { timeAgo } from "@/components/ui";

export const CHANGE_LABEL: Record<string, string> = { opened: "新增", closed: "下架", pay_changed: "薪资", reopened: "重开", page_changed: "页面" };

export function ChangeList({ rows }: { rows: Change[] }) {
  if (!rows.length) return <div className="empty sm-empty"><p>还没有变化。第一次抓取会建立基线，之后的新增、下架和薪资变化会出现在这里。</p></div>;
  return (
    <ul className="mini">
      {rows.map((c) => {
        const pay = fmtPay(c.pay_min, c.pay_max, c.pay_unit);
        return (
          <li key={c.id}>
            <span className="t">
              <span className={`chg chg-${c.type}`}>{CHANGE_LABEL[c.type] ?? c.type}</span>
              {c.signal_id ? <Link href={c.url ?? `/signals/${c.signal_id}`} target={c.url ? "_blank" : undefined}>{c.title ?? c.detail}</Link> : c.detail}
            </span>
            <span className="s">{timeAgo(c.created_at)}</span>
            <span className="sub">
              {c.org || c.source_name}
              {c.subtype === "expert" ? " · 专家岗" : ""}
              {c.type === "pay_changed" ? ` · ${c.detail.split("：").pop()}` : pay ? ` · ${pay}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
