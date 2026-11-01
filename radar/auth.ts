import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";
import { one } from "@/lib/db";
import { newToken, userById, type SessionUser } from "@/lib/users";

export { ensureToken, resetToken, userByToken, type SessionUser } from "@/lib/users";

export const authProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  passcode: Boolean(process.env.TEAM_PASSCODE),
};

function list(v: string | undefined) {
  return (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function isAllowed(email: string) {
  const e = email.toLowerCase();
  if (list(process.env.ALLOWED_EMAILS).includes(e)) return true;
  if (list(process.env.ALLOWED_EMAIL_DOMAINS).includes(e.split("@")[1] ?? "")) return true;
  if (await one("select 1 from rd_users where lower(email) = $1", [e])) return true;
  const n = await one<{ c: number }>("select count(*)::int as c from rd_users");
  return (n?.c ?? 0) === 0;
}

async function upsertUser(email: string, name: string | null | undefined, image: string | null | undefined) {
  const e = email.toLowerCase();
  const first = (await one<{ c: number }>("select count(*)::int as c from rd_users"))?.c === 0;
  const row = await one<{ id: number }>(
    `insert into rd_users (email, name, image, role, api_token) values ($1, $2, $3, $4, $5)
     on conflict (email) do update set name = coalesce(nullif(rd_users.name, ''), excluded.name), image = coalesce(excluded.image, rd_users.image)
     returning id`,
    [e, name || e.split("@")[0], image ?? null, first ? "admin" : "member", newToken()],
  );
  return row!.id;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const providers: NextAuthConfig["providers"] = [];
if (authProviders.google) providers.push(Google);
if (authProviders.passcode) {
  providers.push(
    Credentials({
      id: "passcode",
      name: "团队口令",
      credentials: { name: {}, email: {}, passcode: {} },
      async authorize(c) {
        const email = String(c?.email ?? "").trim().toLowerCase();
        const name = String(c?.name ?? "").trim();
        if (!email.includes("@") || !name) return null;
        if (!safeEqual(String(c?.passcode ?? ""), process.env.TEAM_PASSCODE ?? "")) return null;
        const domains = list(process.env.ALLOWED_EMAIL_DOMAINS);
        if (domains.length && !domains.includes(email.split("@")[1]) && !(await isAllowed(email))) return null;
        return { id: email, email, name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      if (account?.provider === "passcode") return true;
      return isAllowed(user.email);
    },
    async jwt({ token, user }) {
      if (user?.email) token.uid = await upsertUser(user.email, user.name, user.image);
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = String(token.uid);
      return session;
    },
  },
});

export async function currentUser(): Promise<SessionUser | null> {
  const s = await auth();
  const id = Number((s?.user as { id?: string } | undefined)?.id);
  return id ? userById(id) : null;
}
