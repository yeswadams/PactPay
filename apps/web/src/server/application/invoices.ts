import { randomBytes, randomUUID, createHash } from "node:crypto";
import { keccak256, encodeAbiParameters, toHex } from "viem";
import { db, tables, eq, and, desc, ilike, or, count } from "./repository.ts";
import { type Actor, requireOrganization, requireScope } from "./auth.ts";
import { AppError, pageOptions } from "./http.ts";
import { invoiceInputSchema, type SessionData } from "../../lib/domain.ts";
import {
  validatedFile,
  getPrivateObject,
  putPrivateObject,
  deletePrivateObject,
} from "./storage.ts";
import { network } from "../blockchain/runtime.ts";
import { deploymentId } from "@pactpay/blockchain/sync";

type Invoice = typeof tables.invoices.$inferSelect;
export async function accessibleInvoice(
  actor: Actor,
  id: string,
  verifierOnly = false,
) {
  const [invoice] = await db()
    .select()
    .from(tables.invoices)
    .where(eq(tables.invoices.id, id));
  if (!invoice) throw new AppError(404, "Invoice not found");
  const isMember = actor.organizations.some(
    (org) => org.id === invoice.businessId,
  );
  const isVerifier = actor.scopes.includes("verifier");
  if ((!isMember && !isVerifier) || (verifierOnly && !isVerifier))
    throw new AppError(403, "You do not have access to this invoice");
  return invoice;
}
export async function listInvoices(actor: Actor, url: URL, operator = false) {
  if (operator) requireScope(actor, "verifier", "lister", "settler");
  const organization = !operator ? requireOrganization(actor, "sme") : null;
  const options = pageOptions(url);
  if (
    options.status &&
    ![
      "draft",
      "needs_information",
      "submitted",
      "confirmed",
      "rejected",
      "funded",
      "settled",
    ].includes(options.status)
  )
    throw new AppError(400, "Unknown invoice status");
  const condition = and(
    organization ? eq(tables.invoices.businessId, organization.id) : undefined,
    options.status
      ? eq(tables.invoices.status, options.status as Invoice["status"])
      : undefined,
    options.search
      ? or(
          ilike(tables.invoices.invoiceNumber, `%${options.search}%`),
          ilike(tables.businesses.name, `%${options.search}%`),
        )
      : undefined,
  );
  const [rows, total] = await Promise.all([
    db()
      .select({
        invoice: tables.invoices,
        business: tables.businesses,
        beneficiaryAddress: tables.users.walletAddress,
      })
      .from(tables.invoices)
      .innerJoin(
        tables.businesses,
        eq(tables.businesses.id, tables.invoices.businessId),
      )
      .leftJoin(tables.users, eq(tables.users.id, tables.businesses.ownerId))
      .where(condition)
      .orderBy(desc(tables.invoices.createdAt))
      .limit(options.pageSize)
      .offset(options.offset),
    db()
      .select({ count: count() })
      .from(tables.invoices)
      .innerJoin(
        tables.businesses,
        eq(tables.businesses.id, tables.invoices.businessId),
      )
      .where(condition),
  ]);
  const { config } = await network();
  const key = deploymentId(config);
  const records = await db()
    .select()
    .from(tables.invoiceOnchainRecords)
    .where(eq(tables.invoiceOnchainRecords.deploymentId, key));
  return {
    items: rows.map(({ invoice, business, beneficiaryAddress }) => ({
      id: invoice.id,
      beneficiaryAddress,
      invoiceNumber: invoice.invoiceNumber,
      businessName: business.name,
      status: invoice.status,
      faceValueCents: invoice.faceValueCents.toString(),
      advanceCents: invoice.advanceCents.toString(),
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      commitment: invoice.commitment,
      terms: invoice.terms,
      verificationEvidence:
        operator && actor.scopes.includes("verifier")
          ? invoice.verificationEvidence
          : null,
      financing:
        records.find((record) => record.commitment === invoice.commitment) ??
        null,
    })),
    total: total[0].count,
    page: options.page,
    pageSize: options.pageSize,
  };
}
export async function createDraft(actor: Actor, input: unknown) {
  const organization = requireOrganization(actor, "sme");
  const value = invoiceInputSchema.parse(input);
  if (new Date(value.dueDate).getTime() <= Date.now())
    throw new AppError(400, "Invoice maturity must be in the future");
  const key = `${actor.user.id}:${value.idempotencyKey}`;
  const matches = (previous: Invoice) =>
    previous.businessId === organization.id &&
    previous.invoiceNumber === value.invoiceNumber &&
    previous.faceValueCents.toString() === value.faceValueCents &&
    previous.advanceCents.toString() === value.advanceCents &&
    previous.customerName === value.customerName &&
    (previous.customerEmail ?? "") === value.customerEmail &&
    (previous.customerContact ?? "") === value.customerContact &&
    previous.description === value.description &&
    previous.dueDate.toISOString().slice(0, 10) === value.dueDate;
  const salt = toHex(randomBytes(32));
  const commitment = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [
        salt,
        keccak256(
          toHex(`${organization.id}:${value.invoiceNumber.toLowerCase()}`),
        ),
      ],
    ),
  );
  return db().transaction(async (tx) => {
    const { sql } = await import("drizzle-orm");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const [previous] = await tx
      .select()
      .from(tables.invoices)
      .where(eq(tables.invoices.idempotencyKey, key));
    if (previous) {
      if (!matches(previous))
        throw new AppError(
          409,
          "This request key was already used for different invoice details",
        );
      return previous;
    }
    const [invoice] = await tx
      .insert(tables.invoices)
      .values({
        businessId: organization.id,
        invoiceNumber: value.invoiceNumber,
        customerName: value.customerName,
        customerEmail: value.customerEmail || null,
        customerContact: value.customerContact || null,
        description: value.description,
        faceValueCents: Number(value.faceValueCents),
        advanceCents: Number(value.advanceCents),
        dueDate: new Date(value.dueDate),
        status: "draft",
        commitment,
        salt,
        idempotencyKey: key,
      })
      .returning();
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "INVOICE_DRAFT_CREATED",
        subject: invoice.id,
        details: { organizationId: organization.id },
      });
    return invoice;
  });
}
export async function submitDraft(actor: Actor, id: string) {
  const invoice = await accessibleInvoice(actor, id);
  const organization = requireOrganization(actor, "sme");
  if (invoice.businessId !== organization.id)
    throw new AppError(403, "Select the invoice's organization");
  if (invoice.status === "submitted") return invoice;
  return db().transaction(async (tx) => {
    // Serialize uploads/submission/review on this invoice.
    await tx.execute(
      (await import("drizzle-orm"))
        .sql`select id from invoices where id = ${id} for update`,
    );
    const [current] = await tx
      .select()
      .from(tables.invoices)
      .where(eq(tables.invoices.id, id));
    if (!["draft", "needs_information"].includes(current.status))
      throw new AppError(409, "This invoice has already left submission");
    const [documents] = await tx
      .select({ count: count() })
      .from(tables.invoiceDocuments)
      .where(eq(tables.invoiceDocuments.invoiceId, id));
    if (!documents.count)
      throw new AppError(
        400,
        "Add at least one supporting document before submitting",
      );
    const [updated] = await tx
      .update(tables.invoices)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(tables.invoices.id, id))
      .returning();
    await tx
      .insert(tables.events)
      .values({
        invoiceId: id,
        actorId: actor.user.id,
        type: "invoice.submitted",
        message:
          "Submitted for human verification. No financing has been approved yet.",
      });
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "INVOICE_SUBMITTED",
        subject: id,
        details: { previousState: current.status, state: "submitted" },
      });
    return updated;
  });
}
export async function invoiceDetail(actor: Actor, id: string) {
  const invoice = await accessibleInvoice(actor, id);
  const [documents, reviews, history] = await Promise.all([
    db()
      .select({
        id: tables.invoiceDocuments.id,
        fileName: tables.invoiceDocuments.fileName,
        mimeType: tables.invoiceDocuments.mimeType,
        sizeBytes: tables.invoiceDocuments.sizeBytes,
        kind: tables.invoiceDocuments.kind,
        uploadedAt: tables.invoiceDocuments.uploadedAt,
      })
      .from(tables.invoiceDocuments)
      .where(eq(tables.invoiceDocuments.invoiceId, id)),
    db()
      .select()
      .from(tables.reviews)
      .where(eq(tables.reviews.invoiceId, id))
      .orderBy(desc(tables.reviews.createdAt)),
    db()
      .select({
        id: tables.events.id,
        type: tables.events.type,
        message: tables.events.message,
        createdAt: tables.events.createdAt,
        txHash: tables.events.txHash,
      })
      .from(tables.events)
      .where(eq(tables.events.invoiceId, id))
      .orderBy(desc(tables.events.createdAt))
      .limit(50),
  ]);
  const { salt: _salt, idempotencyKey: _key, ...safe } = invoice;
  void _salt;
  void _key;
  return { invoice: safe, documents, reviews, history };
}
export async function uploadInvoiceDocument(
  actor: Actor,
  id: string,
  file: File,
  kind: (typeof tables.invoiceDocuments.$inferInsert)["kind"],
) {
  const invoice = await accessibleInvoice(actor, id);
  const organization = requireOrganization(actor, "sme");
  if (organization.id !== invoice.businessId)
    throw new AppError(403, "Select the submitting organization");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = validatedFile(bytes, file.type);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectKey = `invoices/${organization.id}/${id}/${randomUUID()}`;
  await putPrivateObject(objectKey, bytes, mimeType);
  try {
    return await db().transaction(async (tx) => {
      const { sql } = await import("drizzle-orm");
      await tx.execute(
        sql`select id from invoices where id = ${id} for update`,
      );
      const [current] = await tx
        .select()
        .from(tables.invoices)
        .where(eq(tables.invoices.id, id));
      if (!["draft", "needs_information"].includes(current.status))
        throw new AppError(
          409,
          "Documents can only change before submission or after an information request",
        );
      const docs = await tx
        .select()
        .from(tables.invoiceDocuments)
        .where(eq(tables.invoiceDocuments.invoiceId, id));
      const previous = docs.find(
        (doc) => doc.sha256 === sha256 && doc.kind === kind,
      );
      if (previous) {
        await deletePrivateObject(objectKey);
        return { id: previous.id, fileName: previous.fileName };
      }
      if (docs.length >= 20)
        throw new AppError(
          400,
          "An invoice can have at most 20 supporting documents",
        );
      const [document] = await tx
        .insert(tables.invoiceDocuments)
        .values({
          invoiceId: id,
          kind,
          fileName: file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 160),
          mimeType,
          sizeBytes: bytes.length,
          sha256,
          objectKey,
        })
        .returning({
          id: tables.invoiceDocuments.id,
          fileName: tables.invoiceDocuments.fileName,
        });
      await tx
        .insert(tables.auditLogs)
        .values({
          actor: actor.user.id,
          action: "DOCUMENT_UPLOADED",
          subject: id,
          details: { documentId: document.id, sizeBytes: bytes.length },
        });
      return document;
    });
  } catch (error) {
    await deletePrivateObject(objectKey).catch(() => undefined);
    throw error;
  }
}
export async function downloadInvoiceDocument(
  actor: Actor,
  id: string,
  documentId: string,
) {
  await accessibleInvoice(actor, id);
  const [doc] = await db()
    .select()
    .from(tables.invoiceDocuments)
    .where(
      and(
        eq(tables.invoiceDocuments.id, documentId),
        eq(tables.invoiceDocuments.invoiceId, id),
      ),
    );
  if (!doc) throw new AppError(404, "Document not found");
  const bytes = doc.objectKey
    ? await getPrivateObject(doc.objectKey)
    : doc.content
      ? new Uint8Array(doc.content)
      : null;
  if (!bytes) throw new AppError(404, "Document unavailable");
  await db()
    .insert(tables.auditLogs)
    .values({
      actor: actor.user.id,
      action: "DOCUMENT_ACCESSED",
      subject: id,
      details: { documentId },
    });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
export async function reviewInvoice(
  actor: Actor,
  id: string,
  input: {
    decision: "confirmed" | "rejected" | "needs_information";
    notes: string;
    evidenceReference: string;
  },
) {
  requireScope(actor, "verifier");
  return db().transaction(async (tx) => {
    const { sql } = await import("drizzle-orm");
    await tx.execute(sql`select id from invoices where id = ${id} for update`);
    const [invoice] = await tx
      .select()
      .from(tables.invoices)
      .where(eq(tables.invoices.id, id));
    if (!invoice || invoice.status !== "submitted")
      throw new AppError(409, "Only submitted invoices can be reviewed");
    if (input.decision === "confirmed") {
      const [documents] = await tx
        .select({ count: count() })
        .from(tables.invoiceDocuments)
        .where(eq(tables.invoiceDocuments.invoiceId, id));
      if (!documents.count)
        throw new AppError(
          409,
          "Supporting evidence is required before approval",
        );
    }
    const [updated] = await tx
      .update(tables.invoices)
      .set({
        status: input.decision,
        customerVerified: input.decision === "confirmed",
        verificationEvidence: input.evidenceReference,
        verifiedBy: actor.user.id,
        updatedAt: new Date(),
      })
      .where(eq(tables.invoices.id, id))
      .returning();
    if (input.decision !== "needs_information")
      await tx
        .insert(tables.reviews)
        .values({
          invoiceId: id,
          reviewerId: actor.user.id,
          decision: input.decision,
          notes: input.notes,
        });
    await tx
      .insert(tables.events)
      .values({
        invoiceId: id,
        actorId: actor.user.id,
        type: `invoice.${input.decision}`,
        message: input.notes,
      });
    await tx
      .insert(tables.auditLogs)
      .values({
        actor: actor.user.id,
        action: "INVOICE_REVIEWED",
        subject: id,
        details: { previousState: invoice.status, state: input.decision },
      });
    return updated;
  });
}
export type InvoicePage = Awaited<ReturnType<typeof listInvoices>>;
export type InvoiceDetail = Awaited<ReturnType<typeof invoiceDetail>>;
