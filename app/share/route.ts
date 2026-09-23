import { redirect } from "next/navigation";

// PWA share target: forwards shared text into the import form.
export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const out = new URLSearchParams();
  for (const k of ["title", "text", "url"]) {
    const v = sp.get(k);
    if (v) out.set(k, v.slice(0, 6000));
  }
  redirect(`/import?${out.toString()}`);
}
