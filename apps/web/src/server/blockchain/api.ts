import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  toHex,
  type Hash,
  type Address,
} from "viem";
import {
  financingAbi,
  assertDeployment,
  verifyProtocolTransaction,
} from "@pactpay/blockchain";
import { syncProtocol, deploymentId, toJson } from "@pactpay/blockchain/sync";
import {
  invoices,
  users,
  auditLogs,
  invoiceOnchainRecords,
  investorPositions,
  blockchainTransactions,
  blockchainEvents,
  contractDeployments,
  settlementReconciliations,
  eq,
  and,
  type OfferTerms,
} from "@pactpay/database";
import { authorize, ApiError } from "./auth";
import { database, network } from "./runtime";

const address = z
  .string()
  .refine(isAddress)
  .transform((value) => getAddress(value));
const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v as Hash);
const integer = z
  .string()
  .regex(/^(0|[1-9]\d{0,77})$/)
  .refine((v) => BigInt(v) <= (1n << 256n) - 1n);
const termsSchema = z
  .object({
    token: address,
    beneficiary: address,
    treasury: address,
    target: integer,
    repayment: integer,
    fee: integer,
    fundingDeadline: integer,
    maturity: integer,
  })
  .strict();
const json = (value: unknown, status = 200) =>
  Response.json(toJson(value), {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    throw new ApiError(413, "Request too large");
  const text = await request.text();
  if (text.length > 16384) throw new ApiError(413, "Request too large");
  return JSON.parse(text);
}
const onchainTerms = (t: OfferTerms) => ({
  ...t,
  token: t.token as Address,
  beneficiary: t.beneficiary as Address,
  treasury: t.treasury as Address,
  target: BigInt(t.target),
  repayment: BigInt(t.repayment),
  fee: BigInt(t.fee),
  fundingDeadline: BigInt(t.fundingDeadline),
  maturity: BigInt(t.maturity),
});

export async function handleApi(request: Request, path: string[]) {
  try {
    const route = path.join("/");
    const method = request.method;
    const url = new URL(request.url);
    if (method === "GET" && route === "blockchain/config") {
      const { config, client } = await network();
      await assertDeployment(client, config);
      // Never expose a private server RPC URL (which may contain provider credentials).
      const browserRpc =
        process.env.NEXT_PUBLIC_RPC_URL ??
        (config.deployment.chainId === 31337
          ? "http://127.0.0.1:8545"
          : undefined);
      if (!browserRpc)
        throw new ApiError(503, "Configure a browser-safe public RPC URL");
      new URL(browserRpc);
      return json({ ...config, rpcUrl: browserRpc });
    }
    if (method === "GET" && route === "blockchain/listings") {
      const { config } = await network();
      return json(
        await database()
          .select()
          .from(invoiceOnchainRecords)
          .where(eq(invoiceOnchainRecords.deploymentId, deploymentId(config))),
      );
    }
    if (method === "GET" && route === "blockchain/events") {
      authorize(request, ["verifier", "lister", "settler", "sync"]);
      const { config } = await network();
      return json(
        await database()
          .select()
          .from(blockchainEvents)
          .where(eq(blockchainEvents.deploymentId, deploymentId(config)))
          .limit(200),
      );
    }
    if (method === "GET" && route === "investments") {
      const wallet = address
        .parse(url.searchParams.get("wallet"))
        .toLowerCase();
      const { config } = await network();
      return json(
        await database()
          .select({
            position: investorPositions,
            listing: invoiceOnchainRecords,
          })
          .from(investorPositions)
          .innerJoin(
            invoiceOnchainRecords,
            eq(investorPositions.recordId, invoiceOnchainRecords.id),
          )
          .where(
            and(
              eq(investorPositions.wallet, wallet),
              eq(invoiceOnchainRecords.deploymentId, deploymentId(config)),
            ),
          ),
      );
    }
    if (method === "GET" && route === "blockchain/history") {
      const wallet = address
        .parse(url.searchParams.get("wallet"))
        .toLowerCase();
      const { config } = await network();
      return json(
        await database()
          .select()
          .from(blockchainTransactions)
          .where(
            and(
              eq(blockchainTransactions.sender, wallet),
              eq(blockchainTransactions.deploymentId, deploymentId(config)),
            ),
          )
          .limit(200),
      );
    }
    if (method === "POST" && route === "investments") {
      const input = z
        .object({ hash, wallet: address })
        .strict()
        .parse(await body(request));
      const { config, client } = await network();
      try {
        await verifyProtocolTransaction(
          client,
          config,
          input.hash,
          input.wallet,
        );
      } catch {
        throw new ApiError(
          422,
          "Transaction must be successful, canonical, sufficiently confirmed, and emitted by this protocol for the supplied wallet",
        );
      }
      // Verified receipt alone cannot invent a position. Worker derives canonical projections.
      return json(await syncProtocol(config, database()));
    }
    if (method === "POST" && route === "blockchain/sync") {
      authorize(request, ["sync"]);
      const { config } = await network();
      return json(await syncProtocol(config, database()));
    }
    if (route === "invoices" && method === "POST") {
      const actor = authorize(request, ["sme"]);
      const input = z
        .object({
          canonicalReference: z
            .string()
            .trim()
            .min(4)
            .max(200)
            .transform((s) => s.toLowerCase()),
          faceValueKesMinor: integer.refine((v) => BigInt(v) > 0n),
          documentReference: z.string().trim().min(4).max(500),
        })
        .strict()
        .parse(await body(request));
      const salt = toHex(randomBytes(32));
      const commitment = keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [salt, keccak256(toHex(input.canonicalReference))],
        ),
      );
      const row = await database().transaction(async (tx) => {
        const [owner] = await tx
          .insert(users)
          .values({ externalId: "demo-sme", role: "sme" })
          .onConflictDoUpdate({
            target: users.externalId,
            set: { role: "sme" },
          })
          .returning();
        const [invoice] = await tx
          .insert(invoices)
          .values({ ...input, salt, commitment, ownerId: owner.id })
          .returning();
        await tx.insert(auditLogs).values({
          actor,
          action: "INVOICE_SUBMITTED",
          subject: invoice.id,
          details: { commitment },
        });
        return invoice;
      });
      return json(row, 201);
    }
    if (route === "invoices" && method === "GET") {
      const actor = authorize(request, [
        "sme",
        "verifier",
        "lister",
        "settler",
      ]);
      // Demo exposes one SME identity, bound to its credential rather than a request owner ID.
      if (actor === "sme") {
        return json(
          await database()
            .select({ invoice: invoices })
            .from(invoices)
            .innerJoin(users, eq(invoices.ownerId, users.id))
            .where(eq(users.externalId, "demo-sme")),
        );
      }
      return json(await database().select().from(invoices).limit(200));
    }
    if (path[0] === "invoices" && path.length === 3 && method === "POST") {
      const id = z.uuid().parse(path[1]);
      const operation = path[2];
      const actor = authorize(
        request,
        operation === "verify" || operation === "approval"
          ? ["verifier"]
          : ["lister"],
      );
      const [invoice] = await database()
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));
      if (!invoice) throw new ApiError(404, "Invoice not found");
      if (operation === "verify") {
        const input = z
          .object({
            decision: z.enum(["APPROVED", "REJECTED"]),
            evidenceReference: z.string().trim().min(4).max(500),
            terms: termsSchema.optional(),
          })
          .strict()
          .parse(await body(request));
        if (input.decision === "APPROVED") {
          if (!input.terms)
            throw new ApiError(400, "Approval requires exact financing terms");
          const t = onchainTerms(input.terms);
          const { config, client } = await network();
          const now = (await client.getBlock()).timestamp;
          if (
            t.token !== config.deployment.token ||
            t.target === 0n ||
            t.repayment < t.target ||
            t.fee > t.repayment - t.target ||
            t.fundingDeadline <= now ||
            t.maturity <= t.fundingDeadline ||
            t.maturity >= 1n << 64n ||
            t.beneficiary === config.deployment.financing ||
            t.treasury === config.deployment.financing ||
            /^0x0{40}$/i.test(t.beneficiary) ||
            /^0x0{40}$/i.test(t.treasury)
          )
            throw new ApiError(
              400,
              "Invalid mock-token financing terms or deadlines",
            );
        }
        const rows = await database().transaction(async (tx) => {
          const updated = await tx
            .update(invoices)
            .set({
              status: input.decision,
              verificationEvidence: input.evidenceReference,
              verifiedBy: actor,
              terms: input.decision === "APPROVED" ? input.terms : null,
            })
            .where(and(eq(invoices.id, id), eq(invoices.status, "SUBMITTED")))
            .returning();
          if (!updated.length)
            throw new ApiError(409, "Invoice verification is already final");
          await tx.insert(auditLogs).values({
            actor,
            action: `INVOICE_${input.decision}`,
            subject: id,
            details: { evidenceReference: input.evidenceReference },
          });
          return updated;
        });
        return json(rows[0]);
      }
      if (!["approval", "listing", "disbursement"].includes(operation))
        throw new ApiError(404, "Unknown invoice action");
      if (invoice.status !== "APPROVED" || !invoice.terms)
        throw new ApiError(409, "Off-chain verification is required");
      const { config, client } = await network();
      await assertDeployment(client, config);
      const invoiceId = hash.parse(invoice.commitment);
      const data =
        operation === "approval"
          ? encodeFunctionData({
              abi: financingAbi,
              functionName: "approveInvoice",
              args: [invoiceId, onchainTerms(invoice.terms)],
            })
          : encodeFunctionData({
              abi: financingAbi,
              functionName:
                operation === "listing" ? "openListing" : "disburse",
              args: [invoiceId],
            });
      await database()
        .insert(auditLogs)
        .values({
          actor,
          action: `PREPARE_${operation.toUpperCase()}`,
          subject: id,
          details: { chainId: config.deployment.chainId },
        });
      return json({
        chainId: config.deployment.chainId,
        to: config.deployment.financing,
        data,
        value: "0",
        commitment: invoiceId,
      });
    }
    if (route === "settlements" && method === "GET") {
      authorize(request, ["settler"]);
      const { config } = await network();
      return json(
        await database()
          .select()
          .from(settlementReconciliations)
          .where(
            eq(settlementReconciliations.deploymentId, deploymentId(config)),
          ),
      );
    }
    if (route === "settlements" && method === "POST") {
      const actor = authorize(request, ["settler"]);
      const input = z
        .object({
          invoiceId: z.uuid(),
          evidenceReference: z.string().trim().min(8).max(500),
          amount: integer,
        })
        .strict()
        .parse(await body(request));
      const [invoice] = await database()
        .select()
        .from(invoices)
        .where(eq(invoices.id, input.invoiceId));
      if (!invoice || invoice.status !== "APPROVED" || !invoice.terms)
        throw new ApiError(409, "Approved invoice required");
      const { config, client } = await network();
      await assertDeployment(client, config);
      const listing = await client.readContract({
        address: config.deployment.financing,
        abi: financingAbi,
        functionName: "getListing",
        args: [hash.parse(invoice.commitment)],
      });
      if (
        ![4, 5].includes(listing.state) ||
        BigInt(input.amount) !== listing.terms.repayment
      )
        throw new ApiError(
          409,
          "A disbursed invoice and exact full repayment are required",
        );
      const evidenceCommitment = keccak256(
        toHex(`${randomBytes(32).toString("hex")}:${input.evidenceReference}`),
      );
      const key = deploymentId(config);
      const reconciliation = await database().transaction(async (tx) => {
        await tx
          .insert(contractDeployments)
          .values({
            id: key,
            chainId: config.deployment.chainId,
            address: config.deployment.financing.toLowerCase(),
            manifest: config.deployment,
          })
          .onConflictDoNothing();
        const [record] = await tx
          .insert(settlementReconciliations)
          .values({
            invoiceId: invoice.id,
            deploymentId: key,
            evidenceReference: input.evidenceReference,
            evidenceCommitment,
            amount: input.amount,
            operator: actor,
          })
          .onConflictDoNothing()
          .returning();
        if (!record)
          throw new ApiError(
            409,
            "A reconciliation already exists for this invoice or evidence",
          );
        await tx.insert(auditLogs).values({
          actor,
          action: "REPAYMENT_RECONCILED",
          subject: record.id,
          details: { invoiceId: invoice.id },
        });
        return record;
      });
      const data = encodeFunctionData({
        abi: financingAbi,
        functionName: "depositRepayment",
        args: [
          hash.parse(invoice.commitment),
          BigInt(input.amount),
          reconciliation.evidenceCommitment as Hash,
        ],
      });
      return json(
        {
          reconciliation,
          chainId: config.deployment.chainId,
          to: config.deployment.financing,
          data,
          value: "0",
        },
        201,
      );
    }
    throw new ApiError(404, "Unknown endpoint");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json(
        {
          error: "Invalid request",
          details: error instanceof z.ZodError ? error.issues : undefined,
        },
        400,
      );
    if (
      typeof error === "object" &&
      error !== null &&
      "cause" in error &&
      (error.cause as { code?: string })?.code === "23505"
    )
      return json({ error: "Duplicate invoice or record" }, 409);
    console.error(
      "PactPay API failure",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      {
        error:
          "Service unavailable. Check deployment, database, and RPC configuration.",
      },
      503,
    );
  }
}
