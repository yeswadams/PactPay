// Legacy route adapters. All mutations share the wallet-authenticated services.
import { randomUUID } from "node:crypto";
import { db, tables, eq, and } from "../application/repository.ts";
import { requireActor } from "../application/auth.ts";
import {
  accessibleInvoice,
  createDraft,
  listInvoices as scopedInvoices,
  invoiceDetail,
  reviewInvoice,
  uploadInvoiceDocument,
  downloadInvoiceDocument,
} from "../application/invoices.ts";
import { ApiError } from "../http";
import type { User } from "../auth";
import type {
  CreateInvoiceInput,
  ReviewInput,
  SettleInput,
} from "../validation";
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export function pricingFor(invoice: {
  faceValueCents: number;
  advanceCents: number;
  platformFeeBps: number;
}) {
  const spread = BigInt(invoice.faceValueCents) - BigInt(invoice.advanceCents);
  const fee = (spread * BigInt(invoice.platformFeeBps) + 5000n) / 10000n;
  return {
    spreadCents: Number(spread),
    platformFeeCents: Number(fee),
    investorReturnCents: Number(spread - fee),
  };
}
export async function recordEvent(input: {
  invoiceId: string;
  actorId?: string | null;
  type: string;
  message: string;
  txHash?: string | null;
  detail?: Record<string, unknown>;
}) {
  await db().insert(tables.events).values(input);
}
export async function getAccessibleInvoice(_user: User, invoiceId: string) {
  void _user;
  const actor = await requireActor();
  const invoice = await accessibleInvoice(actor, invoiceId);
  const [business] = await db()
    .select()
    .from(tables.businesses)
    .where(eq(tables.businesses.id, invoice.businessId));
  return {
    invoice,
    business,
    isOwner: actor.organizations.some((org) => org.id === invoice.businessId),
  };
}
export async function listInvoices(_user: User, status?: string) {
  void _user;
  const actor = await requireActor();
  return (
    await scopedInvoices(
      actor,
      new URL(
        `http://internal/?pageSize=50${status ? `&status=${status}` : ""}`,
      ),
      actor.scopes.includes("verifier"),
    )
  ).items;
}
export async function listInvestorCatalog() {
  throw new ApiError(410, "Use the authenticated /api/v1/listings marketplace");
}
export async function getInvoiceDetail(_user: User, invoiceId: string) {
  void _user;
  return invoiceDetail(await requireActor(), invoiceId);
}
export async function createInvoice(_user: User, input: CreateInvoiceInput) {
  void _user;
  return createDraft(await requireActor(), {
    invoiceNumber: input.invoiceNumber,
    customerName: input.customerName,
    customerEmail: input.customerEmail || "",
    customerContact: input.customerContact || "",
    description: input.description,
    faceValueCents: input.faceValueCents.toString(),
    advanceCents: input.advanceCents.toString(),
    dueDate: input.dueDate.toISOString().slice(0, 10),
    idempotencyKey: randomUUID(),
  });
}
export async function decideInvoice(
  _user: User,
  id: string,
  input: ReviewInput,
) {
  void _user;
  return reviewInvoice(await requireActor(), id, {
    decision: input.decision,
    notes:
      input.notes ||
      "Human review decision recorded by the authorized verifier.",
    evidenceReference: "legacy-review-reference",
  });
}
export async function uploadDocument(
  file: { name: string; mimeType: string; sizeBytes: number; content: Buffer },
  options: {
    invoiceId: string;
    kind: "purchase_order" | "contract" | "delivery_record" | "other";
    actor: User;
  },
) {
  const uploaded = await uploadInvoiceDocument(
    await requireActor(),
    options.invoiceId,
    new File([new Uint8Array(file.content)], file.name, {
      type: file.mimeType,
    }),
    options.kind,
  );
  const [doc] = await db()
    .select({
      id: tables.invoiceDocuments.id,
      kind: tables.invoiceDocuments.kind,
      fileName: tables.invoiceDocuments.fileName,
      mimeType: tables.invoiceDocuments.mimeType,
      sizeBytes: tables.invoiceDocuments.sizeBytes,
      sha256: tables.invoiceDocuments.sha256,
      uploadedAt: tables.invoiceDocuments.uploadedAt,
    })
    .from(tables.invoiceDocuments)
    .where(eq(tables.invoiceDocuments.id, uploaded.id));
  return { ...doc, uploadedAt: doc.uploadedAt.toISOString() };
}
export async function getDocument(
  _actor: User,
  invoiceId: string,
  documentId: string,
) {
  void _actor;
  const result = await downloadInvoiceDocument(
    await requireActor(),
    invoiceId,
    documentId,
  );
  const [doc] = await db()
    .select({
      fileName: tables.invoiceDocuments.fileName,
      mimeType: tables.invoiceDocuments.mimeType,
    })
    .from(tables.invoiceDocuments)
    .where(
      and(
        eq(tables.invoiceDocuments.id, documentId),
        eq(tables.invoiceDocuments.invoiceId, invoiceId),
      ),
    );
  return { ...doc, content: Buffer.from(await result.arrayBuffer()) };
}
export async function fundInvoice(_actor: User, _id: string, _wallet?: string) {
  void _actor;
  void _id;
  void _wallet;
  throw new ApiError(
    410,
    "Funding requires a confirmed canonical contract transaction",
  );
}
export async function settleInvoice(
  _actor: User,
  _id: string,
  _input: SettleInput,
) {
  void _actor;
  void _id;
  void _input;
  throw new ApiError(
    410,
    "Settlement requires an authorized full token deposit on-chain",
  );
}
