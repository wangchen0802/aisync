import { randomBytes } from "node:crypto";
import { lark } from "@/lib/notify";

export function GET(req: Request) {
  if (!lark.configured()) return new Response("Lark 登录未配置（LARK_APP_ID / LARK_APP_SECRET）", { status: 404 });
  const origin = new URL(req.url).origin;
  const state = randomBytes(16).toString("base64url");
  const url = new URL(`${lark.domain()}/open-apis/authen/v1/authorize`);
  url.searchParams.set("app_id", process.env.LARK_APP_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/lark/callback`);
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      "set-cookie": `lark_state=${state}; Path=/api/lark; HttpOnly; SameSite=Lax; Max-Age=600${origin.startsWith("https") ? "; Secure" : ""}`,
    },
  });
}
