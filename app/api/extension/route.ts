import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { currentUser } from "@/auth";
import { ensureToken } from "@/lib/apitoken";
import { zip } from "@/lib/zip";

// Downloads the Chrome extension, pre-configured with this deployment's URL and the user's token.
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me) return new Response("请先登录", { status: 401 });
  const token = await ensureToken(me.id);
  const origin = new URL(req.url).origin;
  const dir = path.join(process.cwd(), "extension");
  const names = await readdir(dir);
  const files = await Promise.all(
    names.map(async (name) => {
      const data =
        name === "config.js"
          ? new TextEncoder().encode(`self.SIMREAL_CONFIG = ${JSON.stringify({ url: origin, token })};\n`)
          : new Uint8Array(await readFile(path.join(dir, name)));
      return { name: `simreal-sync/${name}`, data };
    }),
  );
  return new Response(Buffer.from(zip(files)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="simreal-sync-extension.zip"',
      "cache-control": "no-store",
    },
  });
}
