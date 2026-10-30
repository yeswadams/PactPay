import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@pactpay/database";
import { db } from "../db";
import { ApiError, formatKesCents } from "../http";
import type { User } from "../auth";
import type { CreateInvoiceInput, ReviewInput, SettleInput } from "../validation";

type Invoice = typeof schema.invoices.$inferSelect;

// ---- Pricing ----------------------------------------------------------------
// spread = face value - advance. Platform fee is a share of the spread;
// the investor keeps the rest as their agreed return.

export function pricingFor(invoice: Pick<Invoice, "faceValueCents" | "advanceCents" | "platformFeeBps">) {
  const spreadCents = invoice.faceValueCents - invoice.advanceCents;
  const platformFeeCents = Math.round((spreadCents * invoice.platformFeeBps) / 10_000);
  const investorReturnCents = spreadCents - platformFeeCents;
  return { spreadCents, platformFeeCents, investorReturnCents };
}

// ---- Audit trail --------------------------------------------------------------

export async function recordEvent(input: {
  invoiceId: string;
  actorId?: string | null;
  type: string;
  message: string;
  txHash?: string | null;
  detail?: Record<string, unknown>;
}) {
  await db.insert(schema.events).values({
    invoiceId: input.invoiceId,
    actorId: input.actorId ?? null,
    type: input.type,
    message: input.message,
    txHash: input.txHash ?? null,
    detail: input.detail ?? null,
  });
}

// ---- Access control -------------------------------------------------------------


export async function getAccessibleInvoice(user: User, invoiceId: string) {
  const rows = await db
    .select({ invoice: schema.invoices, business: schema.businesses })
    .from(schema.invoices)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.invoices.businessId))
    .where(eq(schema.invoices.id, invoiceId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new ApiError(404, "Invoice not found");

  const { invoice, business } = row;
  const isOwner = user.role === "sme" && (await ownsInvoice(user.id, business.id));
  const isReviewer = user.role === "reviewer";
  const isInvestor = user.role === "investor";
  // Investors only see invoices that passed human verification.
  const investorAllowed = isInvestor && invoice.status !== "submitted";
  if (!isOwner && !isReviewer && !investorAllowed) {
    throw new ApiError(403, "You do not have access to this invoice");
  }
  return { invoice, business, isOwner };
}

async function ownsInvoice(ownerId: string, businessId: string) {
  const rows = await db
    .select({ id: schema.businesses.id })
    .from(schema.businesses)
    .where(and(eq(schema.businesses.ownerId, ownerId), eq(schema.businesses.id, businessId)))
    .limit(1);
  return rows.length > 0;
}

// ---- Listing ----------------------------------------------------------------

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerVerified: boolean;
  status: Invoice["status"];
  description: string;
  faceValueCents: number;
  advanceCents: number;
  platformFeeBps: number;
  dueDate: string;
  createdAt: string;
  businessName: string;
  documentsCount: number;
  pricing: ReturnType<typeof pricingFor>;
  fundedBy: string | null;
  settled: boolean;
};

/** Role-scoped invoice listing. `status` filters within what the role may see. */
export async function listInvoices(user: User, status?: Invoice["status"]) {
  const where =
    user.role === "sme"
      ? eq(schema.businesses.ownerId, user.id)
      : user.role === "reviewer"
        ? status
          ? eq(schema.invoices.status, status)
          : undefined
        : // investors: only human-verified invoices
          and(
            inArray(schema.invoices.status, ["confirmed", "funded", "settled"]),
            status ? eq(schema.invoices.status, status) : undefined,
          );

  return selectSummaries(where);
}

async function selectSummaries(where: ReturnType<typeof eq> | undefined): Promise<InvoiceSummary[]> {
  const rows = await db
    .select({
      invoice: schema.invoices,
      businessName: schema.businesses.name,
      documentsCount: sql<number>`(
        select count(*)::int from ${schema.invoiceDocuments}
        where ${schema.invoiceDocuments.invoiceId} = ${schema.invoices.id}
      )`,
      investorName: sql<string | null>`(
        select u.name from ${schema.investments}
        join ${schema.users} u on u.id = ${schema.investments.investorId}
        where ${schema.investments.invoiceId} = ${schema.invoices.id}
        limit 1
      )`,
      settledAt: sql<Date | null>`(
        select s.settled_at from ${schema.settlements} s
        where s.invoice_id = ${schema.invoices.id}
        limit 1
      )`,
    })
    .from(schema.invoices)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.invoices.businessId))
    .where(where)
    .orderBy(desc(schema.invoices.createdAt));

  return rows.map(({ invoice, ...rest }) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName,
    customerVerified: invoice.customerVerified,
    status: invoice.status,
    description: invoice.description,
    faceValueCents: invoice.faceValueCents,
    advanceCents: invoice.advanceCents,
    platformFeeBps: invoice.platformFeeBps,
    dueDate: invoice.dueDate.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    businessName: rest.businessName,
    documentsCount: rest.documentsCount,
    pricing: pricingFor(invoice),
    fundedBy: rest.investorName ?? null,
    settled: rest.settledAt != null,
  }));
}

/** Investor catalog: verified invoices that can be financed right now. */
export async function listInvestorCatalog() {
  return selectSummaries(eq(schema.invoices.status, "confirmed"));
}

// ---- Detail -------------------------------------------------------------------

export async function getInvoiceDetail(user: User, invoiceId: string) {
  const { invoice, business } = await getAccessibleInvoice(user, invoiceId);

  const [documents, reviews, investments, settlement, events] = await Promise.all([
    db
      .select({
        id: schema.invoiceDocuments.id,
        kind: schema.invoiceDocuments.kind,
        fileName: schema.invoiceDocuments.fileName,
        mimeType: schema.invoiceDocuments.mimeType,
        sizeBytes: schema.invoiceDocuments.sizeBytes,
        sha256: schema.invoiceDocuments.sha256,
        uploadedAt: schema.invoiceDocuments.uploadedAt,
      })
      .from(schema.invoiceDocuments)
      .where(eq(schema.invoiceDocuments.invoiceId, invoiceId))
      .orderBy(schema.invoiceDocuments.uploadedAt),
    db
      .select({ review: schema.reviews, reviewerName: schema.users.name })
      .from(schema.reviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.reviews.reviewerId))
      .where(eq(schema.reviews.invoiceId, invoiceId))
      .orderBy(desc(schema.reviews.createdAt)),
    db
      .select({ investment: schema.investments, investorName: schema.users.name })
      .from(schema.investments)
      .innerJoin(schema.users, eq(schema.users.id, schema.investments.investorId))
      .where(eq(schema.investments.invoiceId, invoiceId)),
    db
      .select()
      .from(schema.settlements)
      .where(eq(schema.settlements.invoiceId, invoiceId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(schema.events)
      .where(eq(schema.events.invoiceId, invoiceId))
      .orderBy(schema.events.createdAt),
  ]);

  const investment = investments[0]?.investment ?? null;

  return {
    invoice: {
      ...invoice,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    },
    business,
    pricing: pricingFor(invoice),
    documents,
    reviews: reviews.map((r) => ({
      ...r.review,
      reviewerName: r.reviewerName,
      createdAt: r.review.createdAt.toISOString(),
    })),
    investment: investment
      ? {
          ...investment,
          createdAt: investment.createdAt.toISOString(),
        }
      : null,
    investorName: investments[0]?.investorName ?? null,
    settlement: settlement
      ? {
          ...settlement,
          settledAt: settlement.settledAt.toISOString(),
        }
      : null,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      txHash: e.txHash,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

// ---- Document upload / download ------------------------------------------------

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function uploadDocument(file: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}, {
  invoiceId,
  kind,
  actor,
}: {
  invoiceId: string;
  kind: "purchase_order" | "contract" | "delivery_record" | "other";
  actor: User;
}) {
  if (file.sizeBytes === 0) throw new ApiError(400, "The file is empty");
  if (file.sizeBytes > MAX_DOCUMENT_BYTES) throw new ApiError(413, "Files must be 5 MB or smaller");
  if (!ALLOWED_MIME.has(file.mimeType)) throw new ApiError(415, "Only PDF, PNG or JPEG files are accepted");

  const { invoice, isOwner } = await getAccessibleInvoice(actor, invoiceId);
  if (!isOwner) throw new ApiError(403, "Only the submitting SME can add documents");
  if (invoice.status !== "submitted") {
    throw new ApiError(409, "Documents can only be added while the invoice is awaiting review");
  }

  const sha256 = createHash("sha256").update(file.content).digest("hex");
  const [doc] = await db
    .insert(schema.invoiceDocuments)
    .values({
      invoiceId,
      kind,
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256,
      content: file.content,
    })
    .returning();

  await recordEvent({
    invoiceId,
    actorId: actor.id,
    type: "document.uploaded",
    message: `Supporting document added: “${file.name}” (${kind.replace("_", " ")}). SHA-256 recorded for auditability.`,
    detail: { sha256, documentId: doc.id },
  });

  return {
    id: doc.id,
    kind: doc.kind,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    uploadedAt: doc.uploadedAt.toISOString(),
  };
}

export async function getDocument(actor: User, invoiceId: string, documentId: string) {
  await getAccessibleInvoice(actor, invoiceId);
  const rows = await db
    .select()
    .from(schema.invoiceDocuments)
    .where(and(eq(schema.invoiceDocuments.id, documentId), eq(schema.invoiceDocuments.invoiceId, invoiceId)))
    .limit(1);
  const doc = rows[0];
  if (!doc) throw new ApiError(404, "Document not found");
  return doc;
}

// ---- SME submission --------------------------------------------------------------

export async function createInvoice(actor: User, input: CreateInvoiceInput) {
  if (actor.role !== "sme") throw new ApiError(403, "Only SME accounts can submit invoices");

  const businessRows = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.ownerId, actor.id))
    .limit(1);
  const business = businessRows[0];
  if (!business) throw new ApiError(409, "Your account has no business record — contact support");

  if (input.advanceCents >= input.faceValueCents) {
    throw new ApiError(400, "The advance must be less than the face value");
  }

  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      businessId: business.id,
      invoiceNumber: input.invoiceNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail || null,
      customerContact: input.customerContact || null,
      description: input.description,
      faceValueCents: input.faceValueCents,
      advanceCents: input.advanceCents,
      platformFeeBps: input.platformFeeBps ?? 2000,
      dueDate: input.dueDate,
      status: "submitted",
    })
    .returning();

  const { spreadCents, platformFeeCents, investorReturnCents } = pricingFor(invoice);
  await recordEvent({
    invoiceId: invoice.id,
    actorId: actor.id,
    type: "invoice.submitted",
    message:
      `Invoice ${invoice.invoiceNumber} for ${formatKesCents(invoice.faceValueCents)} submitted. ` +
      `You requested ${formatKesCents(invoice.advanceCents)} early. Cost of financing: ${formatKesCents(spreadCents)} ` +
      `(platform fee ${formatKesCents(platformFeeCents)}, investor return ${formatKesCents(investorReturnCents)}). ` +
      `A human reviewer will check your business and documents next.`,
    detail: { ...pricingFor(invoice) },
  });

  return serializeInvoice(invoice);
}

// ---- Reviewer decision ------------------------------------------------------------

export async function decideInvoice(actor: User, invoiceId: string, input: ReviewInput) {
  if (actor.role !== "reviewer") throw new ApiError(403, "Only platform reviewers can decide invoices");

  const result = await db
    .update(schema.invoices)
    .set({
      status: input.decision === "confirmed" ? "confirmed" : "rejected",
      customerVerified: input.decision === "confirmed",
      updatedAt: new Date(),
    })
    .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, "submitted")))
    .returning();

  const invoice = result[0];
  if (!invoice) throw new ApiError(409, "Only invoices awaiting review can be decided");

  await db.insert(schema.reviews).values({
    invoiceId,
    reviewerId: actor.id,
    decision: input.decision,
    notes: input.notes || null,
  });

  await recordEvent({
    invoiceId,
    actorId: actor.id,
    type: input.decision === "confirmed" ? "invoice.confirmed" : "invoice.rejected",
    message:
      input.decision === "confirmed"
        ? `A reviewer confirmed invoice ${invoice.invoiceNumber}. The customer was contacted and acknowledged the invoice and delivery. It is now visible to eligible investors.`
        : `A reviewer rejected invoice ${invoice.invoiceNumber}. ${input.notes || "See reviewer notes for details."}`,
    detail: { decision: input.decision, notes: input.notes || null },
  });

  return serializeInvoice(invoice);
}

// ---- Investor funding ---------------------------------------------------------------

export async function fundInvoice(actor: User, invoiceId: string, agentWallet?: string) {
  if (actor.role !== "investor") throw new ApiError(403, "Only investor accounts can fund invoices");

  const invoice = await requireStatus(invoiceId, "confirmed");

  const [investment] = await db
    .insert(schema.investments)
    .values({ invoiceId, investorId: actor.id, amountCents: invoice.advanceCents })
    .returning();

  await db
    .update(schema.invoices)
    .set({ status: "funded", updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));

  const { platformFeeCents, investorReturnCents } = pricingFor(invoice);
  await recordEvent({
    invoiceId,
    actorId: actor.id,
    type: "invoice.funded",
    // Plain-language explanation for both sides; no wallet knowledge required.
    message:
      `Invoice ${invoice.invoiceNumber} was funded for ${formatKesCents(invoice.advanceCents)} ` +
      `by an eligible investor. If the customer pays in full, the investor receives ` +
      `${formatKesCents(invoice.advanceCents + investorReturnCents)} and the platform fee is ` +
      `${formatKesCents(platformFeeCents)}. Testnet record for this funding event is pending ` +
      `(contract integration is a known next step).`,
    detail: { investmentId: investment.id, agentWallet: agentWallet ?? null },
  });

  return serializeInvoice({ ...invoice, status: "funded" });
}

// ---- Settlement -------------------------------------------------------------------------

export async function settleInvoice(actor: User, invoiceId: string, input: SettleInput) {
  if (actor.role !== "sme") throw new ApiError(403, "Only the submitting SME can record a settlement");

  const invoice = await requireStatus(invoiceId, "funded");
  const paidCents = input.paidCents ?? invoice.faceValueCents;
  const { platformFeeCents, investorReturnCents } = pricingFor(invoice);

  if (paidCents <= 0 || paidCents > invoice.faceValueCents) {
    throw new ApiError(400, "The paid amount must be positive and no more than the face value");
  }
  if (paidCents < invoice.advanceCents + investorReturnCents) {
    throw new ApiError(400, `The customer must pay at least the advance plus the investor return (${formatKesCents(invoice.advanceCents + investorReturnCents)})`);
  }

  await db
    .insert(schema.settlements)
    .values({
      invoiceId,
      paidCents,
      investorPayoutCents: invoice.advanceCents + investorReturnCents,
      platformFeeCents,
      latePayment: input.latePayment ?? false,
    });

  await db
    .update(schema.invoices)
    .set({ status: "settled", updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));

  await recordEvent({
    invoiceId,
    actorId: actor.id,
    type: "invoice.settled",
    message:
      `Customer ${invoice.customerName} paid ${formatKesCents(paidCents)}. ` +
      `Payouts: investor receives ${formatKesCents(invoice.advanceCents + investorReturnCents)}, ` +
      `platform fee ${formatKesCents(platformFeeCents)}. Testnet settlement record pending ` +
      `(contract integration later).`,
    detail: { paidCents, investorPayoutCents: invoice.advanceCents + investorReturnCents, platformFeeCents },
  });

  return serializeInvoice({ ...invoice, status: "settled" });
}

async function requireStatus(invoiceId: string, status: Invoice["status"]): Promise<Invoice> {
  const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
  const invoice = rows[0];
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.status !== status) {
    throw new ApiError(409, `This action needs the invoice in “${status}” state, but it is “${invoice.status}”`);
  }
  return invoice;
}

function serializeInvoice(invoice: Invoice) {
  return {
    ...invoice,
    dueDate: invoice.dueDate.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    pricing: pricingFor(invoice),
  };
}
