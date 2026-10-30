import { eq } from "drizzle-orm";
import { schema } from "@pactpay/database";
import { db } from "../db";
import { hashPassword, verifyPassword, createSession, setSessionCookie } from "../auth";
import { ApiError, normalizeIssues } from "../http";
import {
  registerSchema,
  loginSchema,
} from "../validation";

/** Reviewer accounts are provisioned by the demo seed, not open registration. */
const SELF_SERVICE_ROLES = ["sme", "investor"] as const;

export async function register(input: unknown) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, "Please check the form", normalizeIssues(parsed.error));
  }
  const value = parsed.data;
  const email = value.email.trim();
  const name = value.name.trim();
  const businessName = value.businessName?.trim();
  const registrationNumber = value.registrationNumber?.trim();
  const role = value.role;
  const password = value.password;
  if (!SELF_SERVICE_ROLES.includes(role as "sme" | "investor")) {
    throw new ApiError(403, "Reviewer accounts are provisioned by the platform");
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) throw new ApiError(409, "An account with this email already exists");

  const [user] = await db
    .insert(schema.users)
    .values({
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      name,
      role: role as "sme" | "investor",
    })
    .returning();

  if (role === "sme") {
    await db.insert(schema.businesses).values({
      ownerId: user.id,
      name: businessName ?? user.name,
      registrationNumber: registrationNumber ?? "PENDING",
    });
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function login(input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(400, "Please check the form", normalizeIssues(parsed.error));
  }
  const { email, password } = parsed.data;

  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new ApiError(401, "Email or password is incorrect");
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
