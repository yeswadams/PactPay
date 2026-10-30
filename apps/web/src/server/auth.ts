import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  currentActor,
  requireActor,
  logout,
  SESSION_COOKIE as COOKIE,
} from "./application/auth.ts";
import { ApiError } from "./http";
export const SESSION_COOKIE = COOKIE;
export type User = import("@pactpay/database").User;
export type Role = User["role"];
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function createSession(
  _userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  void _userId;
  throw new ApiError(410, "Use wallet sign-in at /api/v1/auth/challenge");
}
export async function setSessionCookie(
  _token: string,
  _expiresAt: Date,
): Promise<void> {
  void _token;
  void _expiresAt;
  throw new ApiError(
    410,
    "Password sessions cannot access the wallet application",
  );
}
export async function clearSession() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  await logout(
    new Request("http://localhost", { headers: { cookie: store.toString() } }),
  );
  store.delete(SESSION_COOKIE);
}
export async function getCurrentUser(): Promise<User | null> {
  const actor = await currentActor();
  if (!actor) return null;
  return {
    ...actor.user,
    role: actor.scopes.includes("verifier")
      ? "reviewer"
      : actor.organization?.role === "sme"
        ? "sme"
        : "investor",
  };
}
export async function requireUser(role?: Role | Role[]): Promise<User> {
  const actor = await requireActor();
  const user = (await getCurrentUser())!;
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    const matches =
      (allowed.includes("reviewer") && actor.scopes.includes("verifier")) ||
      allowed.some((item) => actor.organization?.role === item);
    if (!matches)
      throw new ApiError(
        403,
        "Your wallet session does not have this permission",
      );
  }
  return user;
}
