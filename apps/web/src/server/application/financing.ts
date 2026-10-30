import { randomBytes } from "node:crypto";
import {
  encodeFunctionData,
  keccak256,
  toHex,
  type Address,
  type Hash,
} from "viem";
import {
  financingAbi,
  verifyProtocolTransaction,
  assertDeployment,
} from "@pactpay/blockchain";
import { syncProtocol, deploymentId } from "@pactpay/blockchain/sync";
import {
  db,
  tables,
  eq,
  and,
  desc,
  asc,
  ilike,
  or,
  count,
  sql,
  inArray,
} from "./repository.ts";
import { type Actor, requireScope, requireOrganization } from "./auth.ts";
import { AppError, pageOptions } from "./http.ts";
import { offerSchema } from "../../lib/domain.ts";
import { network } from "../blockchain/runtime.ts";
import type { OfferTerms } from "@pactpay/database";
const sameTerms = (a: OfferTerms, b: OfferTerms) =>
  Object.entries(b).every(
    ([key, value]) =>
      String(a[key as keyof OfferTerms]).toLowerCase() ===
      String(value).toLowerCase(),
  );
const chainTerms = (terms: OfferTerms) => ({
  ...terms,
  token: terms.token as Address,
  beneficiary: terms.beneficiary as Address,
  treasury: terms.treasury as Address,
  target: BigInt(terms.target),
  repayment: BigInt(terms.repayment),
  fee: BigInt(terms.fee),
  fundingDeadline: BigInt(terms.fundingDeadline),
  maturity: BigInt(terms.maturity),
});
export async function prepareFinancing(
  actor: Actor,
  id: string,
  operation: "approval" | "listing" | "disbursement",
  input?: unknown,
) {
  requireScope(actor, operation === "approval" ? "verifier" : "lister");
  const [invoice] = await db()
    .select()
    .from(tables.invoices)
    .where(eq(tables.invoices.id, id));
  if (!invoice || invoice.status !== "confirmed" || !invoice.commitment)
    throw new AppError(409, "A human-approved invoice is required");
  const { config, client } = await network();
  await assertDeployment(client, config);
  let terms = invoice.terms;
  if (operation === "approval") {
    const value = offerSchema.parse(input);
    const latest = await client.getBlock();
    const [owner] = await db()
      .select({ wallet: tables.users.walletAddress })
      .from(tables.businesses)
      .innerJoin(tables.users, eq(tables.users.id, tables.businesses.ownerId))
      .where(eq(tables.businesses.id, invoice.businessId));
    if (
      value.token.toLowerCase() !== config.deployment.token.toLowerCase() ||
      value.beneficiary.toLowerCase() !== owner.wallet?.toLowerCase() ||
      /^0x0{40}$/i.test(value.treasury) ||
      value.treasury.toLowerCase() ===
        config.deployment.financing.toLowerCase() ||
      BigInt(value.fundingDeadline) <= latest.timestamp
    )
      throw new AppError(
        400,
        "Check the approved token, SME beneficiary, treasury and funding deadline",
      );
    if (terms && !sameTerms(terms, value))
      throw new AppError(
        409,
        "Approved terms are immutable; prepare the original terms",
      );
    await db().transaction(async (tx) => {
      const saved = await tx
        .update(tables.invoices)
        .set({ terms: value })
        .where(
          and(
            eq(tables.invoices.id, id),
            sql`${tables.invoices.terms} is null`,
          ),
        )
        .returning();
      if (!saved.length) {
        const [existing] = await tx
          .select()
          .from(tables.invoices)
          .where(eq(tables.invoices.id, id));
        if (!existing.terms || !sameTerms(existing.terms, value))
          throw new AppError(
            409,
            "Terms were already prepared by another operator",
          );
      }
      await tx
        .insert(tables.auditLogs)
        .values({
          actor: actor.user.id,
          action: "FINANCING_TERMS_PREPARED",
          subject: id,
          details: {
            target: value.target,
            repayment: value.repayment,
            fee: value.fee,
            token: value.token,
          },
        });
    });
    terms = value;
  }
  if (!terms)
    throw new AppError(
      409,
      "Approve financing terms before opening this listing",
    );
  if (operation !== "approval") {
    const chain = await client.readContract({
      address: config.deployment.financing,
      abi: financingAbi,
      functionName: "getListing",
      args: [invoice.commitment as Hash],
    });
    const canonical = Object.fromEntries(
      Object.entries(chain.terms).map(([key, value]) => [key, String(value)]),
    ) as OfferTerms;
    if (!sameTerms(terms, canonical))
      throw new AppError(
        409,
        "On-chain terms do not match the recorded approved agreement",
      );
  }
  const data =
    operation === "approval"
      ? encodeFunctionData({
          abi: financingAbi,
          functionName: "approveInvoice",
          args: [invoice.commitment as Hash, chainTerms(terms)],
        })
      : encodeFunctionData({
          abi: financingAbi,
          functionName: operation === "listing" ? "openListing" : "disburse",
          args: [invoice.commitment as Hash],
        });
  await db()
    .insert(tables.auditLogs)
    .values({
      actor: actor.user.id,
      action: `PREPARE_${operation.toUpperCase()}`,
      subject: id,
      details: { chainId: config.deployment.chainId },
    });
  return {
    to: config.deployment.financing,
    data,
    chainId: config.deployment.chainId,
    commitment: invoice.commitment,
  };
}
export async function prepareSettlement(
  actor: Actor,
  input: { invoiceId: string; amount: string; evidenceReference: string },
) {
  requireScope(actor, "settler");
  const { config, client } = await network();
  await assertDeployment(client, config);
  const [invoice] = await db()
    .select()
    .from(tables.invoices)
    .where(eq(tables.invoices.id, input.invoiceId));
  if (!invoice?.commitment)
    throw new AppError(404, "Financing invoice not found");
  const listing = await client.readContract({
    address: config.deployment.financing,
    abi: financingAbi,
    functionName: "getListing",
    args: [invoice.commitment as Hash],
  });
  if (
    ![4, 5].includes(listing.state) ||
    listing.terms.repayment !== BigInt(input.amount)
  )
    throw new AppError(
      409,
      "Only the exact full repayment of a disbursed offer can be deposited",
    );
  const key = deploymentId(config);
  const record = await db().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${key}:${invoice.id}`}))`,
    );
    const [previous] = await tx
      .select()
      .from(tables.settlementReconciliations)
      .where(
        and(
          eq(tables.settlementReconciliations.invoiceId, invoice.id),
          eq(tables.settlementReconciliations.deploymentId, key),
        ),
      );
    if (previous) {
      if (
        previous.amount !== input.amount ||
        previous.evidenceReference !== input.evidenceReference
      )
        throw new AppError(
          409,
          "A different reconciliation already exists for this invoice",
        );
      return previous;
    }
    await tx
      .insert(tables.contractDeployments)
      .values({
        id: key,
        address: config.deployment.financing.toLowerCase(),
        chainId: config.deployment.chainId,
        manifest: config.deployment,
      })
      .onConflictDoNothing();
    const evidenceCommitment = keccak256(
      toHex(`${randomBytes(32).toString("hex")}:${input.evidenceReference}`),
    );
    const [record] = await tx
      .insert(tables.settlementReconciliations)
      .values({
        invoiceId: invoice.id,
        deploymentId: key,
        amount: input.amount,
        evidenceReference: input.evidenceReference,
        evidenceCommitment,
        operator: actor.user.id,
      })
      .returning();
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "REPAYMENT_RECONCILED",
        subject: invoice.id,
        details: { reconciliationId: record.id, amount: record.amount },
      });
    return record;
  });
  return {
    to: config.deployment.financing,
    data: encodeFunctionData({
      abi: financingAbi,
      functionName: "depositRepayment",
      args: [
        invoice.commitment as Hash,
        BigInt(input.amount),
        record.evidenceCommitment as Hash,
      ],
    }),
    reconciliation: record,
    chainId: config.deployment.chainId,
  };
}
export async function verifyAndSynchronize(actor: Actor, hash: Hash) {
  const { client, config } = await network();
  try {
    await verifyProtocolTransaction(
      client,
      config,
      hash,
      actor.user.walletAddress as Address,
    );
  } catch {
    throw new AppError(
      422,
      "The transaction must be successful, confirmed and canonical, sent by your signed-in wallet to this protocol",
    );
  }
  const result = await syncProtocol(config, db());
  await db()
    .insert(tables.auditLogs)
    .values({
      actor: actor.user.id,
      action: "TRANSACTION_VERIFIED",
      subject: hash,
      details: { chainId: config.deployment.chainId, transactionHash: hash },
    });
  return result;
}
export async function marketplace(url: URL) {
  const { config } = await network();
  const options = pageOptions(url);
  if (
    options.status &&
    !["1", "2", "3", "4", "5", "6", "7", "8"].includes(options.status)
  )
    throw new AppError(400, "Unknown financing state");
  const query = and(
    eq(tables.invoiceOnchainRecords.deploymentId, deploymentId(config)),
    eq(tables.invoices.status, "confirmed"),
    options.status
      ? eq(tables.invoiceOnchainRecords.state, Number(options.status))
      : inArray(tables.invoiceOnchainRecords.state, [2, 3, 4, 5, 6, 7]),
    options.search
      ? or(
          sql`${tables.invoices.id}::text ilike ${`%${options.search}%`}`,
          and(
            eq(tables.businesses.discloseName, true),
            ilike(tables.businesses.name, `%${options.search}%`),
          ),
        )
      : undefined,
  );
  const order =
    options.sort === "maturity"
      ? asc(tables.invoices.dueDate)
      : options.sort === "target"
        ? sql`(${tables.invoiceOnchainRecords.snapshot}->'terms'->>'target')::numeric desc`
        : desc(tables.invoices.createdAt);
  const [rows, totals] = await Promise.all([
    db()
      .select({
        invoice: tables.invoices,
        business: tables.businesses,
        record: tables.invoiceOnchainRecords,
      })
      .from(tables.invoiceOnchainRecords)
      .innerJoin(
        tables.invoices,
        eq(tables.invoices.commitment, tables.invoiceOnchainRecords.commitment),
      )
      .innerJoin(
        tables.businesses,
        eq(tables.businesses.id, tables.invoices.businessId),
      )
      .where(query)
      .orderBy(order)
      .limit(options.pageSize)
      .offset(options.offset),
    db()
      .select({ count: count() })
      .from(tables.invoiceOnchainRecords)
      .innerJoin(
        tables.invoices,
        eq(tables.invoices.commitment, tables.invoiceOnchainRecords.commitment),
      )
      .innerJoin(
        tables.businesses,
        eq(tables.businesses.id, tables.invoices.businessId),
      )
      .where(query),
  ]);
  return {
    items: rows.map(({ invoice, business, record }) => ({
      id: invoice.id,
      reference: `PP-${invoice.id.slice(0, 8).toUpperCase()}`,
      businessName: business.discloseName
        ? business.name
        : "Business name private",
      faceValueCents: invoice.faceValueCents.toString(),
      advanceCents: invoice.advanceCents.toString(),
      dueDate: invoice.dueDate.toISOString(),
      commitment: record.commitment as Hash,
      state: record.state,
      snapshot: record.snapshot as {
        terms: OfferTerms;
        funded: string;
        distributed: string;
        feePaid: boolean;
        investors: string;
        claims: string;
        state: number;
      },
      blockNumber: record.blockNumber,
      verified: true,
    })),
    total: totals[0].count,
    page: options.page,
    pageSize: options.pageSize,
  };
}
export async function financingDetail(id: string) {
  const { config } = await network();
  const [row] = await db()
    .select({
      invoice: tables.invoices,
      business: tables.businesses,
      record: tables.invoiceOnchainRecords,
    })
    .from(tables.invoiceOnchainRecords)
    .innerJoin(
      tables.invoices,
      eq(tables.invoices.commitment, tables.invoiceOnchainRecords.commitment),
    )
    .innerJoin(
      tables.businesses,
      eq(tables.businesses.id, tables.invoices.businessId),
    )
    .where(
      and(
        eq(tables.invoices.id, id),
        eq(tables.invoices.status, "confirmed"),
        eq(tables.invoiceOnchainRecords.deploymentId, deploymentId(config)),
      ),
    );
  if (!row) throw new AppError(404, "Verified financing offer not found");
  const events = await db()
    .select()
    .from(tables.blockchainEvents)
    .where(
      and(
        eq(tables.blockchainEvents.deploymentId, deploymentId(config)),
        sql`${tables.blockchainEvents.args}->>'invoiceId' = ${row.invoice.commitment}`,
      ),
    )
    .orderBy(
      sql`${tables.blockchainEvents.blockNumber}::numeric asc`,
      asc(tables.blockchainEvents.logIndex),
    );
  return {
    id: row.invoice.id,
    reference: `PP-${row.invoice.id.slice(0, 8).toUpperCase()}`,
    businessName: row.business.discloseName
      ? row.business.name
      : "Business name private",
    faceValueCents: row.invoice.faceValueCents.toString(),
    advanceCents: row.invoice.advanceCents.toString(),
    dueDate: row.invoice.dueDate.toISOString(),
    commitment: row.record.commitment as Hash,
    state: row.record.state,
    blockNumber: row.record.blockNumber,
    snapshot: row.record.snapshot,
    events,
  };
}
export async function investorPortfolio(actor: Actor, url: URL) {
  requireOrganization(actor, "investor");
  const { config } = await network();
  const options = pageOptions(url);
  const where = and(
    eq(tables.investorPositions.wallet, actor.user.walletAddress!),
    eq(tables.invoiceOnchainRecords.deploymentId, deploymentId(config)),
  );
  const rows = await db()
    .select({
      position: tables.investorPositions,
      record: tables.invoiceOnchainRecords,
      invoiceId: tables.invoices.id,
    })
    .from(tables.investorPositions)
    .innerJoin(
      tables.invoiceOnchainRecords,
      eq(tables.invoiceOnchainRecords.id, tables.investorPositions.recordId),
    )
    .leftJoin(
      tables.invoices,
      eq(tables.invoices.commitment, tables.invoiceOnchainRecords.commitment),
    )
    .where(where)
    .limit(options.pageSize)
    .offset(options.offset);
  const all = await db()
    .select({
      position: tables.investorPositions,
      state: tables.invoiceOnchainRecords.state,
    })
    .from(tables.investorPositions)
    .innerJoin(
      tables.invoiceOnchainRecords,
      eq(tables.invoiceOnchainRecords.id, tables.investorPositions.recordId),
    )
    .where(where);
  const claims = await db()
    .select({
      amount: sql<string>`coalesce(sum((${tables.blockchainEvents.args}->>'amount')::numeric),0)::text`,
    })
    .from(tables.blockchainEvents)
    .where(
      and(
        eq(tables.blockchainEvents.deploymentId, deploymentId(config)),
        eq(tables.blockchainEvents.name, "Claimed"),
        sql`lower(${tables.blockchainEvents.args}->>'investor') = ${actor.user.walletAddress}`,
      ),
    );
  return {
    items: rows,
    total: all.length,
    page: options.page,
    pageSize: options.pageSize,
    totals: {
      contributed: all
        .reduce((sum, row) => sum + BigInt(row.position.contribution), 0n)
        .toString(),
      claimable: all
        .reduce((sum, row) => sum + BigInt(row.position.claimable), 0n)
        .toString(),
      refundable: all
        .filter((row) => row.state === 8 && !row.position.refunded)
        .reduce((sum, row) => sum + BigInt(row.position.contribution), 0n)
        .toString(),
      distributed: claims[0].amount,
      active: all.filter(
        (row) => [2, 3, 4, 5].includes(row.state) && !row.position.refunded,
      ).length,
    },
  };
}
export type MarketplacePage = Awaited<ReturnType<typeof marketplace>>;
export type FinancingDetail = Awaited<ReturnType<typeof financingDetail>>;
export type PortfolioPage = Awaited<ReturnType<typeof investorPortfolio>>;
