import { q } from "@/lib/db";
import { goalPct, listGoals } from "@/lib/core";
import { dmUser, hasWebhook, lark, notify } from "@/lib/notify";
import { code, fmtDue, todayISO, weekStart, weekday, addDays } from "@/lib/meta";

// Weekday 09:00 (Beijing): personal Lark DMs with each person's day, plus the week's goals to the team channel on Mondays.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const today = todayISO();
  let dms = 0;

  if (lark.configured()) {
    const users = await q<{ id: number; name: string }>("select id, coalesce(name, email) as name from users where lark_open_id is not null and not invited");
    for (const u of users) {
      const tasks = await q<{ id: number; title: string; due_date: string }>(
        `select id, title, due_date from items where kind = 'task' and visibility = 'team' and status <> 'done'
           and assignee_id = $1 and due_date is not null and due_date <= $2::date order by due_date`,
        [u.id, addDays(today, 1)],
      );
      const waiting = await q<{ id: number; title: string; owner: string }>(
        `select i.id, i.title, coalesce(o.name, '') as owner from items i left join users o on o.id = i.owner_id
         where i.kind = 'decision' and i.visibility = 'team' and i.status = 'discussing'
           and not exists (select 1 from acks a where a.item_id = i.id and a.user_id = $1) order by i.created_at limit 5`,
        [u.id],
      );
      if (!tasks.length && !waiting.length) continue;
      const lines = [
        ...tasks.map((t) => `${t.due_date < today ? "🔴" : "🟠"} **${fmtDue(t.due_date, today)}** · ${code("task", t.id)} ${t.title}`),
        ...(waiting.length ? ["", `**等你确认的决策（${waiting.length}）**`, ...waiting.map((w) => `• ${code("decision", w.id)} ${w.title}（${w.owner}）`)] : []),
      ];
      if (await dmUser(u.id, `早上好 ${u.name}，今天需要你关注 ${tasks.length + waiting.length} 件事`, lines, "/")) dms++;
    }
  }

  let posted = false;
  if (weekday(today) === 1 && (await hasWebhook())) {
    const goals = (await listGoals(0, weekStart(today))).filter((g) => g.scope === "team");
    const due = await q<{ id: number; title: string; due_date: string; who: string | null }>(
      `select i.id, i.title, i.due_date, u.name as who from items i left join users u on u.id = i.assignee_id
       where i.kind = 'task' and i.visibility = 'team' and i.status <> 'done' and i.due_date between $1::date and $2::date order by i.due_date limit 12`,
      [today, addDays(today, 6)],
    );
    if (goals.length || due.length) {
      await notify("📅 本周目标与 DDL", [
        ...(goals.length ? ["**本周目标**", ...goals.map((g) => `• ${g.title}（${goalPct(g)}%）`)] : []),
        ...(due.length ? ["", "**本周到期**", ...due.map((d) => `• ${fmtDue(d.due_date, today)} · ${d.title}${d.who ? `（${d.who}）` : ""}`)] : []),
      ], "/week");
      posted = true;
    }
  }
  return Response.json({ ok: true, dms, posted });
}
