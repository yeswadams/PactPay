import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createSiweMessage } from "viem/siwe";
import { type Address, type Hex, getAddress } from "viem";
import { db, tables, eq, and, gt, desc } from "./repository.ts";
import { AppError, appOrigin, assertOrigin } from "./http.ts";
import { network } from "../blockchain/runtime.ts";
import type { OperatorScope, SessionData } from "../../lib/domain.ts";
export const SESSION_COOKIE = "pactpay_session";
export const CHALLENGE_COOKIE = "pactpay_challenge";
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Actor = {
  user: typeof tables.users.$inferSelect;
  session: typeof tables.sessions.$inferSelect;
  organization: SessionData["organization"];
  organizations: SessionData["organizations"];
  scopes: OperatorScope[];
};
function cookie(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function cookieHeader(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${appOrigin().protocol === "https:" ? "; Secure" : ""}`;
}
export async function createChallenge(
  address: Address,
  chainId: number,
  request: Request,
) {
  const origin = assertOrigin(request);
  const { config } = await network();
  if (chainId !== config.deployment.chainId)
    throw new AppError(
      400,
      "Switch to the configured network",
      "UNSUPPORTED_NETWORK",
    );
  const previous = await db()
    .select({ id: tables.walletChallenges.id })
    .from(tables.walletChallenges)
    .where(
      and(
        eq(tables.walletChallenges.wallet, address.toLowerCase()),
        gt(tables.walletChallenges.createdAt, new Date(Date.now() - 300000)),
      ),
    )
    .limit(10);
  if (previous.length >= 10)
    throw new AppError(
      429,
      "Too many sign-in attempts. Please wait a few minutes.",
    );
  const token = randomBytes(32).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 300000);
  const message = createSiweMessage({
    address: getAddress(address),
    chainId,
    domain: origin.host,
    scheme: origin.protocol.slice(0, -1),
    uri: `${origin.origin}/login`,
    version: "1",
    nonce,
    issuedAt,
    expirationTime: expiresAt,
    statement:
      "Sign in to PactPay. This does not move funds or approve token spending.",
  });
  await db()
    .insert(tables.walletChallenges)
    .values({
      id: tokenHash(token),
      nonce,
      wallet: address.toLowerCase(),
      message,
      expiresAt,
    });
  return { message, token, expiresAt };
}
export async function verifyChallenge(
  request: Request,
  message: string,
  signature: Hex,
) {
  const origin = assertOrigin(request);
  const token = cookie(request, CHALLENGE_COOKIE);
  if (!token)
    throw new AppError(401, "Start a new wallet sign-in", "CHALLENGE_REQUIRED");
  const [challenge] = await db()
    .select()
    .from(tables.walletChallenges)
    .where(
      and(
        eq(tables.walletChallenges.id, tokenHash(token)),
        gt(tables.walletChallenges.expiresAt, new Date()),
      ),
    );
  if (!challenge || challenge.message !== message)
    throw new AppError(
      401,
      "This sign-in request is expired or already used",
      "INVALID_CHALLENGE",
    );
  const { client, config } = await network();
  const valid = await client.verifySiweMessage({
    message,
    signature,
    address: getAddress(challenge.wallet),
    domain: origin.host,
    nonce: challenge.nonce,
  });
  if (!valid)
    throw new AppError(
      401,
      "The wallet signature could not be verified",
      "INVALID_SIGNATURE",
    );
  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 8 * 3600000);
  await db().transaction(async (tx) => {
    const consumed = await tx
      .delete(tables.walletChallenges)
      .where(
        and(
          eq(tables.walletChallenges.id, challenge.id),
          gt(tables.walletChallenges.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!consumed.length)
      throw new AppError(
        401,
        "This sign-in request was already used",
        "REPLAYED_CHALLENGE",
      );
    const [user] = await tx
      .insert(tables.users)
      .values({
        walletAddress: challenge.wallet,
        name: "Wallet account",
        role: "investor",
      })
      .onConflictDoUpdate({
        target: tables.users.walletAddress,
        set: { walletAddress: challenge.wallet },
      })
      .returning();
    const [membership] = await tx
      .select()
      .from(tables.organizationMembers)
      .where(eq(tables.organizationMembers.userId, user.id))
      .orderBy(desc(tables.organizationMembers.createdAt))
      .limit(1);
    await tx
      .insert(tables.sessions)
      .values({
        token: tokenHash(sessionToken),
        userId: user.id,
        walletAddress: challenge.wallet,
        chainId: config.deployment.chainId,
        organizationId: membership?.organizationId,
        kind: "wallet",
        expiresAt,
      });
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: user.id,
        action: "WALLET_SIGN_IN",
        subject: user.id,
        details: { chainId: config.deployment.chainId },
      });
  });
  return { token: sessionToken, expiresAt };
}
export async function currentActor(request?: Request): Promise<Actor | null> {
  if (!request) await connection();
  const token = request
    ? cookie(request, SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db()
    .select({ user: tables.users, session: tables.sessions })
    .from(tables.sessions)
    .innerJoin(tables.users, eq(tables.users.id, tables.sessions.userId))
    .where(
      and(
        eq(tables.sessions.token, tokenHash(token)),
        eq(tables.sessions.kind, "wallet"),
        gt(tables.sessions.expiresAt, new Date()),
      ),
    );
  if (
    !row ||
    !row.user.walletAddress ||
    row.session.walletAddress !== row.user.walletAddress ||
    row.session.chainId !== Number(process.env.CHAIN_ID ?? 31337)
  )
    return null;
  const memberships = await db()
    .select({
      organization: tables.businesses,
      membership: tables.organizationMembers,
    })
    .from(tables.organizationMembers)
    .innerJoin(
      tables.businesses,
      eq(tables.businesses.id, tables.organizationMembers.organizationId),
    )
    .where(eq(tables.organizationMembers.userId, row.user.id))
    .orderBy(desc(tables.organizationMembers.createdAt));
  const organizations = memberships.map(({ organization, membership }) => ({
    isOwner: organization.ownerId === row.user.id,
    id: organization.id,
    name: organization.name,
    kind: organization.kind,
    role: membership.role,
    verificationStatus: organization.verificationStatus,
    eligibilityStatus: membership.eligibilityStatus,
    contactEmail: organization.contactEmail,
    contactPhone: organization.contactPhone,
    registrationNumber: organization.registrationNumber,
    discloseName: organization.discloseName,
  }));
  const grants = await db()
    .select()
    .from(tables.operatorGrants)
    .where(eq(tables.operatorGrants.userId, row.user.id));
  return {
    ...row,
    organizations,
    organization:
      organizations.find((org) => org.id === row.session.organizationId) ??
      null,
    scopes: grants.map((g) => g.scope as OperatorScope),
  };
}
export async function requireActor(request?: Request) {
  const actor = await currentActor(request);
  if (!actor)
    throw new AppError(
      401,
      "Sign in with your wallet to continue",
      "AUTHENTICATION_REQUIRED",
    );
  return actor;
}
export function requireScope(actor: Actor, ...scopes: OperatorScope[]) {
  if (!actor.scopes.some((scope) => scopes.includes(scope)))
    throw new AppError(
      403,
      "This operation requires an authorized operator",
      "FORBIDDEN",
    );
}
export function requireOrganization(actor: Actor, role?: "sme" | "investor") {
  if (!actor.organization || (role && actor.organization.role !== role))
    throw new AppError(
      403,
      "Select an authorized organization for this workspace",
      "ORGANIZATION_REQUIRED",
    );
  return actor.organization;
}
export function sessionData(actor: Actor): SessionData {
  return {
    user: {
      id: actor.user.id,
      name: actor.user.name,
      email: actor.user.email,
      walletAddress: actor.user.walletAddress!,
      onboarded: !!actor.user.onboardedAt,
      timezone: actor.user.settings.timezone,
    },
    organization: actor.organization,
    organizations: actor.organizations,
    scopes: actor.scopes,
    expiresAt: actor.session.expiresAt.toISOString(),
  };
}
export async function logout(request: Request) {
  const token = cookie(request, SESSION_COOKIE);
  if (token)
    await db()
      .delete(tables.sessions)
      .where(eq(tables.sessions.token, tokenHash(token)));
}
