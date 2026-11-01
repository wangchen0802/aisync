import { createHash } from "node:crypto";

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", times: "×",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Rough but dependable HTML → plain text: keeps paragraph and list breaks, drops scripts/styles/nav chrome. */
export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse returns HTML that is itself entity-encoded (&lt;p&gt;…).
  if (/&lt;[a-z/]/i.test(s) && !/<[a-z/]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|article|header|footer|blockquote|pre|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n{2,}(?=• )/g, "\n")
    .trim();
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export function oneLine(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

const CJK = /[　-鿿가-힯豈-﫿]/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Compiles a keyword into a matcher. ASCII keywords match on word boundaries, tolerate "-", "_" or spacing
 * differences and an optional plural "s"; CJK keywords match as substrings.
 */
export function keywordRegex(keyword: string): RegExp | null {
  const k = keyword.trim();
  if (!k) return null;
  if (CJK.test(k)) return new RegExp(escapeRe(k), "i");
  const body = escapeRe(k.toLowerCase()).replace(/(?:\\-|\s|_)+/g, "[\\s\\-_]*");
  const plural = /[a-z]$/.test(k) ? "s?" : "";
  return new RegExp(`(?<![a-z0-9])${body}${plural}(?![a-z0-9])`, "i");
}

/** Builds one matcher per keyword list, cached by the joined list. */
const cache = new Map<string, RegExp[]>();
export function matchers(keywords: string[]): RegExp[] {
  const id = keywords.join("\u0001");
  let m = cache.get(id);
  if (!m) {
    m = keywords.map(keywordRegex).filter((r): r is RegExp => Boolean(r));
    cache.set(id, m);
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  }
  return m;
}

export function anyMatch(text: string, keywords: string[]) {
  return matchers(keywords).some((r) => r.test(text));
}

export function countMatches(text: string, keywords: string[]) {
  return matchers(keywords).reduce((n, r) => n + (r.test(text) ? 1 : 0), 0);
}

/** Parses a date-ish value into an ISO string, or null. Future dates (bad clocks) are clamped to now. */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  return new Date(Math.min(d.getTime(), now)).toISOString();
}

export function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}
