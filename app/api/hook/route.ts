import { currentUser } from "@/auth";
import { ensureToken } from "@/lib/apitoken";
import { userFromRequest } from "@/lib/token";

import { SCRIPT } from "@/lib/hook-script";

export async function GET(req: Request) {
  const me = (await userFromRequest(req)) ?? (await currentUser());
  if (!me) return new Response("请先登录，或带上个人密钥：-H 'Authorization: Bearer sr_...'", { status: 401 });
  const token = await ensureToken(me.id);
  return new Response(SCRIPT(new URL(req.url).origin, token), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "content-disposition": 'attachment; filename="simreal-sync.mjs"',
      "cache-control": "no-store",
    },
  });
}
