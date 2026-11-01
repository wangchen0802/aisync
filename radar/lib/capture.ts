import "server-only";
import { one, q } from "@/lib/db";
import { insertSignal, loadTopics, prepare } from "@/lib/pipeline";
import { INTENT_LABEL } from "@/lib/taxonomy";
import { clip } from "@/lib/text";

export type CaptureInput = { url?: string; title?: string; text?: string; intent?: string; note?: string; org?: string };

/** Stores a hand-picked signal (bookmarklet, form, API, MCP). Hand-picked = starred and relevant by definition. */
export async function capture(userId: number, input: CaptureInput): Promise<{ id: number; existed: boolean }> {
  const text = String(input.text ?? "").trim();
  const url = String(input.url ?? "").trim();
  const title = String(input.title ?? "").trim();
  if (!text && !url && !title) throw new Error("至少填写链接、标题或内容之一");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("链接需要以 http(s):// 开头");
  const intent = input.intent && INTENT_LABEL[input.intent] ? input.intent : undefined;
  const source =
    (await one<{ id: number; kind: string; config: Record<string, unknown> }>("select id, kind, config from rd_sources where kind = 'manual' order by id limit 1")) ??
    (await one<{ id: number; kind: string; config: Record<string, unknown> }>("insert into rd_sources (kind, name) values ('manual', '手动收录') returning id, kind, config"))!;
  const channel = /^https?:\/\/(?:[\w-]+\.)*(?:x|twitter)\.com\//i.test(url) ? "x" : /reddit\.com/i.test(url) ? "reddit" : /news\.ycombinator\.com/i.test(url) ? "hn" : "manual";
  const p = prepare({ id: url || `${Date.now()}-${userId}`, url: url || null, title, body: text, org: String(input.org ?? "").trim(), publishedAt: new Date().toISOString() });
  const note = clip(String(input.note ?? "").trim(), 2000);
  if (url) {
    const ex = await one<{ id: number }>("select id from rd_signals where source_id = $1 and external_id = $2", [source.id, p.externalId]);
    if (ex) {
      await q(
        "update rd_signals set note = case when $2 = '' then note else $2 end, body = case when $3 = '' then body else $3 end, starred = true, dismissed = false where id = $1",
        [ex.id, note, p.body],
      );
      return { id: ex.id, existed: true };
    }
  }
  const id = await insertSignal(source, p, await loadTopics(), { capturedBy: userId, note, channel, intent });
  await q("update rd_signals set relevance = greatest(relevance, 60), starred = true where id = $1", [id]);
  return { id, existed: false };
}
