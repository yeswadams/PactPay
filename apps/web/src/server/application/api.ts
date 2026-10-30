import { z } from "zod";
import { type Hash } from "viem";
import { syncProtocol, deploymentId } from "@pactpay/blockchain/sync";
import { assertDeployment } from "@pactpay/blockchain";
import {
  currentActor,
  requireActor,
  sessionData,
  createChallenge,
  verifyChallenge,
  cookieHeader,
  SESSION_COOKIE,
  CHALLENGE_COOKIE,
  logout,
  requireScope,
  requireOrganization,
} from "./auth.ts";
import {
  AppError,
  assertOrigin,
  readJson,
  response,
  failure,
  pageOptions,
} from "./http.ts";
import { db, tables, eq, and, desc, sql, count } from "./repository.ts";
import {
  onboard,
  selectOrganization,
  updateOrganization,
} from "./organizations.ts";
import {
  createDraft,
  listInvoices,
  invoiceDetail,
  submitDraft,
  uploadInvoiceDocument,
  downloadInvoiceDocument,
  reviewInvoice,
} from "./invoices.ts";
import {
  marketplace,
  financingDetail,
  investorPortfolio,
  prepareFinancing,
  prepareSettlement,
  verifyAndSynchronize,
} from "./financing.ts";
import { dashboard } from "./dashboard.ts";
import { evmAddress, transactionHash, baseUnits } from "../../lib/domain.ts";
import { network } from "../blockchain/runtime.ts";
const id = (value: string) => z.uuid().parse(value);
export async function handleApplicationApi(request: Request, path: string[]) {
  try {
    const method = request.method;
    const route = path.join("/");
    const url = new URL(request.url);
    if (!["GET", "HEAD"].includes(method)) assertOrigin(request);
    if (method === "GET" && route === "blockchain/config") {
      const { config, client } = await network();
      await assertDeployment(client, config);
      const publicRpc =
        process.env.NEXT_PUBLIC_RPC_URL ??
        (config.deployment.chainId === 31337
          ? "http://127.0.0.1:8545"
          : undefined);
      if (!publicRpc)
        throw new AppError(503, "Configure a browser-safe public RPC URL");
      return response({ ...config, rpcUrl: publicRpc });
    }
    if (method === "GET" && route === "auth/session") {
      const actor = await currentActor(request);
      return response(actor ? sessionData(actor) : null);
    }
    if (method === "POST" && route === "auth/challenge") {
      const input = z
        .object({ address: evmAddress, chainId: z.number().int().positive() })
        .strict()
        .parse(await readJson(request));
      const challenge = await createChallenge(
        input.address,
        input.chainId,
        request,
      );
      const result = response({
        message: challenge.message,
        expiresAt: challenge.expiresAt,
      });
      result.headers.append(
        "Set-Cookie",
        cookieHeader(CHALLENGE_COOKIE, challenge.token, 300),
      );
      return result;
    }
    if (method === "POST" && route === "auth/verify") {
      const input = z
        .object({
          message: z.string().min(100).max(4000),
          signature: z
            .string()
            .regex(/^0x[0-9a-fA-F]+$/)
            .max(20000),
        })
        .strict()
        .parse(await readJson(request, 24000));
      const session = await verifyChallenge(
        request,
        input.message,
        input.signature as `0x${string}`,
      );
      const result = response({
        authenticated: true,
        expiresAt: session.expiresAt,
      });
      result.headers.append(
        "Set-Cookie",
        cookieHeader(SESSION_COOKIE, session.token, 8 * 3600),
      );
      result.headers.append(
        "Set-Cookie",
        cookieHeader(CHALLENGE_COOKIE, "", 0),
      );
      return result;
    }
    if (method === "POST" && route === "auth/logout") {
      await logout(request);
      const result = response({ signedOut: true });
      result.headers.append("Set-Cookie", cookieHeader(SESSION_COOKIE, "", 0));
      return result;
    }
    const actor = await requireActor(request);
    if (method === "GET" && route === "profile")
      return response(sessionData(actor));
    if (method === "POST" && route === "onboarding")
      return response(await onboard(actor, await readJson(request)), 201);
    if (method === "POST" && route === "organizations/select") {
      const input = z
        .object({ id: z.uuid() })
        .strict()
        .parse(await readJson(request));
      await selectOrganization(actor, input.id);
      return response({ selected: input.id });
    }
    if (method === "GET" && route === "organizations")
      return response(actor.organizations);
    if (method === "POST" && route === "organizations")
      return response(
        await updateOrganization(
          actor,
          z
            .object({
              name: z.string().trim().min(2).max(160),
              contactEmail: z.email().max(200),
              contactPhone: z.string().max(60),
              discloseName: z.boolean(),
            })
            .strict()
            .parse(await readJson(request)),
        ),
      );
    if (method === "GET" && route === "organizations/members") {
      const organization = requireOrganization(actor);
      return response(
        await db()
          .select({
            id: tables.organizationMembers.id,
            name: tables.users.name,
            walletAddress: tables.users.walletAddress,
            role: tables.organizationMembers.role,
            eligibilityStatus: tables.organizationMembers.eligibilityStatus,
          })
          .from(tables.organizationMembers)
          .innerJoin(
            tables.users,
            eq(tables.users.id, tables.organizationMembers.userId),
          )
          .where(
            eq(tables.organizationMembers.organizationId, organization.id),
          ),
      );
    }
    if (method === "POST" && route === "organizations/members") {
      const organization = requireOrganization(actor);
      const input = z
        .object({ wallet: evmAddress })
        .strict()
        .parse(await readJson(request));
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
        throw new AppError(403, "Only the organization owner may add members");
      await db().transaction(async (tx) => {
        const [user] = await tx
          .insert(tables.users)
          .values({
            walletAddress: input.wallet.toLowerCase(),
            name: "Wallet account",
            role: "investor",
          })
          .onConflictDoUpdate({
            target: tables.users.walletAddress,
            set: { walletAddress: input.wallet.toLowerCase() },
          })
          .returning();
        await tx
          .insert(tables.organizationMembers)
          .values({
            userId: user.id,
            organizationId: organization.id,
            role: organization.kind,
          })
          .onConflictDoNothing();
        await tx
          .insert(tables.auditLogs)
          .values({
            actor: actor.user.id,
            action: "ORGANIZATION_MEMBER_ADDED",
            subject: organization.id,
            details: { memberId: user.id },
          });
      });
      return response({ added: true });
    }
    if (method === "POST" && route === "settings") {
      const input = z
        .object({
          timezone: z.string().refine((value) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: value });
              return true;
            } catch {
              return false;
            }
          }),
        })
        .strict()
        .parse(await readJson(request));
      await db()
        .update(tables.users)
        .set({ settings: input })
        .where(eq(tables.users.id, actor.user.id));
      return response(input);
    }
    if (method === "GET" && route === "dashboard")
      return response(await dashboard(actor));
    if (route === "invoices" && method === "GET")
      return response(await listInvoices(actor, url));
    if (route === "invoices" && method === "POST")
      return response(await createDraft(actor, await readJson(request)), 201);
    if (path[0] === "invoices" && path[1]) {
      const invoiceId = id(path[1]);
      if (path.length === 2 && method === "GET")
        return response(await invoiceDetail(actor, invoiceId));
      if (path[2] === "submit" && method === "POST")
        return response(await submitDraft(actor, invoiceId));
      if (path[2] === "documents" && path[3] && method === "GET")
        return await downloadInvoiceDocument(actor, invoiceId, id(path[3]));
      if (path[2] === "documents" && method === "POST") {
        if (
          Number(request.headers.get("content-length") ?? 0) >
          5 * 1024 * 1024 + 65536
        )
          throw new AppError(413, "Use files no larger than 5 MB");
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
          throw new AppError(400, "Attach a PDF, PNG or JPEG up to 5 MB");
        const kind = z
          .enum(["purchase_order", "contract", "delivery_record", "other"])
          .parse(form.get("kind") ?? "other");
        return response(
          await uploadInvoiceDocument(actor, invoiceId, file, kind),
          201,
        );
      }
      if (path[2] === "review" && method === "POST")
        return response(
          await reviewInvoice(
            actor,
            invoiceId,
            z
              .object({
                decision: z.enum([
                  "confirmed",
                  "rejected",
                  "needs_information",
                ]),
                notes: z.string().trim().min(10).max(2000),
                evidenceReference: z.string().trim().min(5).max(500),
              })
              .strict()
              .parse(await readJson(request)),
          ),
        );
      if (
        ["approval", "listing", "disbursement"].includes(path[2]) &&
        method === "POST"
      )
        return response(
          await prepareFinancing(
            actor,
            invoiceId,
            path[2] as "approval" | "listing" | "disbursement",
            path[2] === "approval" ? await readJson(request) : undefined,
          ),
        );
    }
    if (
      (route === "listings" || route === "blockchain/listings") &&
      method === "GET"
    )
      return response(await marketplace(url));
    if (path[0] === "listings" && path[1] && method === "GET")
      return response(await financingDetail(id(path[1])));
    if (route === "investments" && method === "GET")
      return response(await investorPortfolio(actor, url));
    if (
      ["transactions/verify", "investments"].includes(route) &&
      method === "POST"
    ) {
      const input = z
        .object({ hash: transactionHash, wallet: evmAddress.optional() })
        .strict()
        .parse(await readJson(request));
      if (
        input.wallet &&
        input.wallet.toLowerCase() !== actor.user.walletAddress
      )
        throw new AppError(
          403,
          "Transactions must belong to the signed-in wallet",
        );
      return response(await verifyAndSynchronize(actor, input.hash as Hash));
    }
    if (
      ["transactions", "blockchain/history"].includes(route) &&
      method === "GET"
    ) {
      const { config } = await network();
      const options = pageOptions(url);
      const where = and(
        eq(tables.blockchainTransactions.deploymentId, deploymentId(config)),
        eq(tables.blockchainTransactions.sender, actor.user.walletAddress!),
      );
      const items = await db()
        .select()
        .from(tables.blockchainTransactions)
        .where(where)
        .orderBy(
          sql`${tables.blockchainTransactions.blockNumber}::numeric desc`,
        )
        .limit(options.pageSize)
        .offset(options.offset);
      const [total] = await db()
        .select({ count: count() })
        .from(tables.blockchainTransactions)
        .where(where);
      return response({
        items,
        total: total.count,
        page: options.page,
        pageSize: options.pageSize,
      });
    }
    if (route === "settlements" && method === "POST")
      return response(
        await prepareSettlement(
          actor,
          z
            .object({
              invoiceId: z.uuid(),
              amount: baseUnits,
              evidenceReference: z.string().trim().min(8).max(500),
            })
            .strict()
            .parse(await readJson(request)),
        ),
      );
    if (route === "settlements" && method === "GET") {
      requireScope(actor, "settler");
      const { config } = await network();
      const options = pageOptions(url);
      const where = eq(
        tables.settlementReconciliations.deploymentId,
        deploymentId(config),
      );
      const items = await db()
        .select()
        .from(tables.settlementReconciliations)
        .where(where)
        .orderBy(desc(tables.settlementReconciliations.createdAt))
        .limit(options.pageSize)
        .offset(options.offset);
      const [total] = await db()
        .select({ count: count() })
        .from(tables.settlementReconciliations)
        .where(where);
      return response({
        items,
        total: total.count,
        page: options.page,
        pageSize: options.pageSize,
      });
    }
    if (route === "admin/invoices" && method === "GET")
      return response(await listInvoices(actor, url, true));
    if (route === "admin/audit" && method === "GET") {
      requireScope(actor, "auditor", "administrator");
      const options = pageOptions(url);
      const items = await db()
        .select()
        .from(tables.auditLogs)
        .orderBy(desc(tables.auditLogs.createdAt))
        .limit(options.pageSize)
        .offset(options.offset);
      const [total] = await db()
        .select({ count: count() })
        .from(tables.auditLogs);
      return response({
        items,
        total: total.count,
        page: options.page,
        pageSize: options.pageSize,
      });
    }
    if (route === "admin/eligibility" && method === "GET") {
      requireScope(actor, "verifier", "administrator");
      return response(
        await db()
          .select({
            id: tables.organizationMembers.id,
            name: tables.users.name,
            wallet: tables.users.walletAddress,
            organizationName: tables.businesses.name,
            status: tables.organizationMembers.eligibilityStatus,
          })
          .from(tables.organizationMembers)
          .innerJoin(
            tables.users,
            eq(tables.users.id, tables.organizationMembers.userId),
          )
          .innerJoin(
            tables.businesses,
            eq(tables.businesses.id, tables.organizationMembers.organizationId),
          )
          .where(eq(tables.organizationMembers.role, "investor"))
          .limit(100),
      );
    }
    if (route === "admin/eligibility" && method === "POST") {
      requireScope(actor, "verifier", "administrator");
      const input = z
        .object({
          membershipId: z.uuid(),
          status: z.enum(["APPROVED", "REJECTED"]),
          reason: z.string().trim().min(10).max(500),
        })
        .strict()
        .parse(await readJson(request));
      await db().transaction(async (tx) => {
        const rows = await tx
          .update(tables.organizationMembers)
          .set({ eligibilityStatus: input.status })
          .where(
            and(
              eq(tables.organizationMembers.id, input.membershipId),
              eq(tables.organizationMembers.role, "investor"),
            ),
          )
          .returning();
        if (!rows.length)
          throw new AppError(404, "Investor membership not found");
        await tx
          .insert(tables.auditLogs)
          .values({
            actor: actor.user.id,
            action: "INVESTOR_ELIGIBILITY_REVIEWED",
            subject: input.membershipId,
            details: { status: input.status, reason: input.reason },
          });
      });
      return response({ updated: true });
    }
    if (route === "blockchain/sync" && method === "POST") {
      requireScope(actor, "verifier", "lister", "settler", "administrator");
      const { config } = await network();
      return response(await syncProtocol(config, db()));
    }
    if (route === "blockchain/events" && method === "GET") {
      requireScope(actor, "verifier", "lister", "settler", "auditor");
      const { config } = await network();
      const options = pageOptions(url);
      return response(
        await db()
          .select()
          .from(tables.blockchainEvents)
          .where(eq(tables.blockchainEvents.deploymentId, deploymentId(config)))
          .orderBy(sql`${tables.blockchainEvents.blockNumber}::numeric desc`)
          .limit(options.pageSize)
          .offset(options.offset),
      );
    }
    throw new AppError(404, "Endpoint not found", "NOT_FOUND");
  } catch (error) {
    return failure(error);
  }
}
