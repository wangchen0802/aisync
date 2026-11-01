import { CaptureForm } from "@/components/capture";

export const metadata = { title: "收录" };

/** Opened by the bookmarklet in a small window, prefilled with the page URL, title and selected text. */
export default async function Capture({ searchParams }: { searchParams: Promise<{ u?: string; t?: string; s?: string }> }) {
  const sp = await searchParams;
  return (
    <section className="box pad" style={{ maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 18 }}>收录到需求雷达</h1>
      <CaptureForm initial={{ url: sp.u ?? "", title: (sp.t ?? "").slice(0, 300), text: (sp.s ?? "").slice(0, 6000) }} />
    </section>
  );
}
