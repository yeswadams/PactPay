import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { schema } from "@pactpay/database";
import { db } from "./db";
import { ApiError } from "./http";

export const SESSION_COOKIE = "pactpay_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type User = typeof schema.users.$inferSelect;
export type Role = User["role"];

// ---- Passwords -------------------------------------------------------------
// Demo-grade scrypt hashing; swap for argon2/bcrypt in a real deployment.

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---- Sessions ---------------------------------------------------------------

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ token, userId, expiresAt });
  return { token, expiresAt };
}

/** Sets the session cookie. Works in route handlers and server actions. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(schema.sessions).where(eq(schema.sessions.token, token));
  }
  store.delete(SESSION_COOKIE);
}

/** Reads the current user from the session cookie, or null when signed out. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.token, token), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0]?.user ?? null;
}

/** Requires a signed-in user, optionally with one of the given roles. */
export async function requireUser(role?: Role | Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Sign in to continue");
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(user.role)) {
      throw new ApiError(403, "You do not have access to this action");
    }
  }
  return user;
}
