import { decodeEntities, htmlToText, oneLine } from "@/lib/text";

export type FeedItem = { id: string; title: string; link: string; summary: string; published: string | null; author: string; source: string };

function inner(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return cdata(m[1]);
}

function cdata(s: string) {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

function attr(xml: string, tag: string, name: string, where?: (tagText: string) => boolean): string {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  for (const m of xml.matchAll(re)) {
    if (where && !where(m[0])) continue;
    const a = m[0].match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    if (a) return decodeEntities(a[2] ?? a[3] ?? "");
  }
  return "";
}

const text = (s: string) => htmlToText(s);

/** Minimal RSS 2.0 / Atom parser — enough for blogs, Substack, Google News and arXiv. */
export function parseFeed(xml: string): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return blocks.map((b) => {
    const title = oneLine(text(inner(b, "title")));
    let link = "";
    if (isAtom) {
      link = attr(b, "link", "href", (t) => !/rel\s*=\s*["'](?!alternate)/i.test(t)) || attr(b, "link", "href");
    } else {
      link = decodeEntities(inner(b, "link").trim()) || attr(b, "link", "href");
    }
    const id = (inner(b, isAtom ? "id" : "guid") || link || title).trim();
    const summary = text(inner(b, "content:encoded") || inner(b, "content") || inner(b, "summary") || inner(b, "description"));
    const published = (inner(b, "published") || inner(b, "pubDate") || inner(b, "updated") || inner(b, "dc:date")).trim() || null;
    const authors = isAtom
      ? [...b.matchAll(/<author\b[\s\S]*?<\/author>/gi)].map((a) => text(inner(a[0], "name"))).filter(Boolean)
      : [text(inner(b, "dc:creator") || inner(b, "author"))].filter(Boolean);
    const source = text(inner(b, "source"));
    return { id: decodeEntities(id), title, link, summary, published, author: authors.slice(0, 4).join(", "), source };
  });
}
