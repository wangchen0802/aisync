import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { larkIdentityFromCode, signTicket } from "@/lib/lark-auth";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const jar = await cookies();
  if (!code || !state || jar.get("lark_state")?.value !== state) redirect("/login?error=LarkState");
  let ticket: string;
  try {
    ticket = signTicket(await larkIdentityFromCode(code));
  } catch (e) {
    console.error("lark callback", e);
    redirect("/login?error=Lark");
  }
  try {
    await signIn("lark", { ticket, redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=AccessDenied");
    throw e;
  }
}
