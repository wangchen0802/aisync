import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";
import { one, q } from "@/lib/db";
import { verifyTicket } from "@/lib/lark-auth";

export const authProviders = {
  lark: Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET),
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  passcode: Boolean(process.env.TEAM_PASSCODE),
};

function list(v: string | undefined) {
  return (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Google/GitHub users must match an allowed domain/email, be invited, or be the very first user. */
async function isAllowed(email: string) {
  const e = email.toLowerCase();
  if (list(process.env.ALLOWED_EMAILS).includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  if (list(process.env.ALLOWED_EMAIL_DOMAINS).includes(domain)) return true;
  if (await one("select 1 from users where lower(email) = $1", [e])) return true;
  const n = await one<{ c: number }>("select count(*)::int as c from users");
  return (n?.c ?? 0) === 0;
}

async function upsertUser(email: string, name: string | null | undefined, image: string | null | undefined) {
  const e = email.toLowerCase();
  const first = (await one<{ c: number }>("select count(*)::int as c from users"))?.c === 0;
  const row = await one<{ id: number }>(
    `insert into users (email, name, image, role, invited)
     values ($1, $2, $3, $4, false)
     on conflict (email) do update set
       name = coalesce(nullif(users.name, ''), excluded.name),
       image = coalesce(excluded.image, users.image),
       invited = false
     returning id`,
    [e, name || e.split("@")[0], image ?? null, first ? "admin" : "member"],
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
if (authProviders.github) providers.push(GitHub);
if (authProviders.lark) {
  providers.push(
    Credentials({
      id: "lark",
      name: "Lark",
      credentials: { ticket: {} },
      async authorize(c) {
        const who = verifyTicket(String(c?.ticket ?? ""));
        if (!who) return null;
        // Lark users come from your own tenant (internal app), so they are team members by definition.
        await upsertUser(who.email, who.name, who.image);
        await q("update users set lark_open_id = $2, image = coalesce($3, image) where lower(email) = $1", [who.email, who.openId, who.image]);
        return { id: who.email, email: who.email, name: who.name, image: who.image };
      },
    }),
  );
}
if (authProviders.passcode) {
  providers.push(
    Credentials({
      id: "passcode",
      name: "团队口令",
      credentials: { name: {}, email: {}, passcode: {} },
      async authorize(c) {
        const email = String(c?.email ?? "").trim().toLowerCase();
        const name = String(c?.name ?? "").trim();
        const passcode = String(c?.passcode ?? "");
        if (!email.includes("@") || !name) return null;
        if (!safeEqual(passcode, process.env.TEAM_PASSCODE ?? "")) return null;
        const domains = list(process.env.ALLOWED_EMAIL_DOMAINS);
        if (domains.length && !domains.includes(email.split("@")[1]) && !(await isAllowed(email))) return null;
        // An account already bound to Lark must sign in through Lark, so the shared passcode can't be used to impersonate it.
        if (authProviders.lark && (await one("select 1 from users where lower(email) = $1 and lark_open_id is not null", [email]))) return null;
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
      if (account?.provider === "passcode" || account?.provider === "lark") return true;
      return isAllowed(user.email);
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.uid = await upsertUser(user.email, user.name, user.image);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = String(token.uid);
      return session;
    },
  },
});

export type SessionUser = { id: number; email: string; name: string; image: string | null; role: string; api_token: string | null };

/** Returns the signed-in user row, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const s = await auth();
  const id = Number((s?.user as { id?: string } | undefined)?.id);
  if (!id) return null;
  const rows = await q<SessionUser>("select id, email, name, image, role, api_token from users where id = $1", [id]);
  return rows[0] ?? null;
}
