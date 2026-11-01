/** Pure formatting helpers, safe for client components. */

export function fmtPay(min: number | null, max: number | null, unit: string | null) {
  if (min == null) return "";
  const k = (n: number) => (unit === "yr" ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`);
  return `$${k(min)}${max && max !== min ? `–${k(max)}` : ""}${unit === "hr" ? "/h" : "/yr"}`;
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 10);
}
