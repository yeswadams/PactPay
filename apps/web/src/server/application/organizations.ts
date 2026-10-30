import { db, tables, eq, and } from "./repository.ts";
import { type Actor, requireOrganization } from "./auth.ts";
import { onboardingSchema } from "../../lib/domain.ts";
import { AppError } from "./http.ts";
export async function onboard(actor: Actor, input: unknown) {
  const value = onboardingSchema.parse(input);
  return db().transaction(async (tx) => {
    await tx
      .update(tables.users)
      .set({
        name: value.name,
        email: value.email.toLowerCase(),
        onboardedAt: new Date(),
      })
      .where(eq(tables.users.id, actor.user.id));
    const [organization] = await tx
      .insert(tables.businesses)
      .values({
        ownerId: actor.user.id,
        name: value.organizationName,
        registrationNumber: value.registrationNumber || "NOT_APPLICABLE",
        kind: value.kind,
        contactEmail: value.email.toLowerCase(),
        contactPhone: value.contactPhone,
        discloseName: value.discloseName,
      })
      .returning();
    await tx
      .insert(tables.organizationMembers)
      .values({
        organizationId: organization.id,
        userId: actor.user.id,
        role: value.kind,
        eligibilityStatus: "PENDING",
      });
    await tx
      .update(tables.sessions)
      .set({ organizationId: organization.id })
      .where(eq(tables.sessions.id, actor.session.id));
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "ORGANIZATION_CREATED",
        subject: organization.id,
        details: { kind: value.kind, verificationStatus: "PENDING" },
      });
    return organization;
  });
}
export async function selectOrganization(actor: Actor, id: string) {
  if (!actor.organizations.some((org) => org.id === id))
    throw new AppError(403, "Organization membership is required");
  await db()
    .update(tables.sessions)
    .set({ organizationId: id })
    .where(eq(tables.sessions.id, actor.session.id));
}
export async function updateOrganization(
  actor: Actor,
  input: {
    name: string;
    contactEmail: string;
    contactPhone: string;
    discloseName: boolean;
  },
) {
  const organization = requireOrganization(actor);
  // Ownership governs changes; ordinary members can only read the organization.
  const [owned] = await db()
    .select()
    .from(tables.businesses)
    .where(
      and(
        eq(tables.businesses.id, organization.id),
        eq(tables.businesses.ownerId, actor.user.id),
      ),
    );
  if (!owned)
    throw new AppError(403, "Only the organization owner can edit its profile");
  return db().transaction(async (tx) => {
    const [updated] = await tx
      .update(tables.businesses)
      .set(input)
      .where(eq(tables.businesses.id, organization.id))
      .returning();
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "ORGANIZATION_UPDATED",
        subject: organization.id,
        details: { discloseName: input.discloseName },
      });
    return updated;
  });
}
