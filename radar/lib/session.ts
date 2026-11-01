import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "@/auth";
import { dbConfigured } from "@/lib/db";

export async function requireUser(): Promise<SessionUser> {
  if (!dbConfigured() || !process.env.AUTH_SECRET) redirect("/login");
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
