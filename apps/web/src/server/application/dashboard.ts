import { db, tables, and, eq, desc, sql, count } from "./repository.ts";
import { type Actor, requireOrganization, requireScope } from "./auth.ts";
import { network } from "../blockchain/runtime.ts";
import { deploymentId } from "@pactpay/blockchain/sync";
import { investorPortfolio } from "./financing.ts";
export async function dashboard(actor: Actor) {
  if (actor.organization?.role === "investor")
    return {
      kind: "investor" as const,
      portfolio: await investorPortfolio(
        actor,
        new URL("http://internal/?pageSize=5"),
      ),
    };
  if (actor.organization?.role === "sme") {
    const organization = requireOrganization(actor, "sme");
    const { config } = await network();
    const rows = await db()
      .select()
      .from(tables.invoices)
      .where(eq(tables.invoices.businessId, organization.id));
    const financings = await db()
      .select({
        record: tables.invoiceOnchainRecords,
        invoice: tables.invoices,
      })
      .from(tables.invoiceOnchainRecords)
      .innerJoin(
        tables.invoices,
        eq(tables.invoices.commitment, tables.invoiceOnchainRecords.commitment),
      )
      .where(
        and(
          eq(tables.invoices.businessId, organization.id),
          eq(tables.invoiceOnchainRecords.deploymentId, deploymentId(config)),
        ),
      );
    const activity = await db()
      .select({
        id: tables.events.id,
        message: tables.events.message,
        createdAt: tables.events.createdAt,
      })
      .from(tables.events)
      .innerJoin(
        tables.invoices,
        eq(tables.invoices.id, tables.events.invoiceId),
      )
      .where(eq(tables.invoices.businessId, organization.id))
      .orderBy(desc(tables.events.createdAt))
      .limit(8);
    return {
      kind: "sme" as const,
      faceValue: rows
        .reduce((sum, row) => sum + BigInt(row.faceValueCents), 0n)
        .toString(),
      submitted: rows.length,
      pending: rows.filter((row) => row.status === "submitted").length,
      approved: rows.filter((row) => row.status === "confirmed").length,
      activeFunding: financings.filter((row) =>
        [2, 3].includes(row.record.state),
      ).length,
      received: financings
        .filter((row) => [4, 5, 6, 7].includes(row.record.state))
        .reduce(
          (sum, row) =>
            sum +
            BigInt(
              (row.record.snapshot as { terms: { target: string } }).terms
                .target,
            ),
          0n,
        )
        .toString(),
      invoices: rows
        .slice(-5)
        .reverse()
        .map((row) => ({
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          status: row.status,
          faceValueCents: row.faceValueCents.toString(),
          dueDate: row.dueDate.toISOString(),
        })),
      activity,
      upcoming: financings
        .filter((row) => [4, 5].includes(row.record.state))
        .map((row) => ({
          id: row.invoice.id,
          invoiceNumber: row.invoice.invoiceNumber,
          dueDate: row.invoice.dueDate.toISOString(),
          state: row.record.state,
        })),
    };
  }
  requireScope(
    actor,
    "verifier",
    "lister",
    "settler",
    "auditor",
    "administrator",
  );
  const [pending] = await db()
    .select({ count: count() })
    .from(tables.invoices)
    .where(eq(tables.invoices.status, "submitted"));
  const [prepared] = await db()
    .select({ count: count() })
    .from(tables.settlementReconciliations)
    .where(eq(tables.settlementReconciliations.status, "PREPARED"));
  const recent = await db()
    .select()
    .from(tables.auditLogs)
    .orderBy(desc(tables.auditLogs.createdAt))
    .limit(8);
  return {
    kind: "operator" as const,
    pending: pending.count,
    prepared: prepared.count,
    activity: recent.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      subject: log.subject,
    })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
