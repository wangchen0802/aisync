import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "@/auth";
import type { Actor } from "@/lib/core";
import { dbConfigured } from "@/lib/db";

export async function requireUser(): Promise<SessionUser & Actor> {
  if (!dbConfigured() || !process.env.AUTH_SECRET) redirect("/login");
  const u = await currentUser();
  if (!u) redirect("/login");
  return { ...u, name: u.name || u.email.split("@")[0] };
}
