"use server";

import { requireUser, getCurrentUser, clearSession } from "@/server/auth";
import { ApiError, normalizeIssues } from "@/server/http";
import { register, login } from "@/server/services/accounts";
import {
  createInvoice,
  decideInvoice,
  fundInvoice,
  settleInvoice,
  uploadDocument,
} from "@/server/services/invoices";
import { seedDemoData } from "@/server/services/seed";
import {
  createInvoiceSchema,
  documentKindSchema,
  registerSchema,
  loginSchema,
  reviewSchema,
  settleSchema,
} from "@/server/validation";
export type ActionError = { error: string; issues?: { path: string; message: string }[] };
export type ActionResult<T> = ({ ok: true } & T) | ({ ok: false } & ActionError);

function toError(error: unknown): { ok: false; error: string; issues?: ActionError["issues"] } {
  if (error instanceof ApiError) {
    return { ok: false, error: error.message, issues: error.issues };
  }
  console.error("[action] unexpected error", error);
  return { ok: false, error: "Something went wrong — please try again" };
}

// ---- Auth -------------------------------------------------------------------

export async function registerAction(input: unknown): Promise<ActionResult<{ user: unknown }>> {
  try {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Please check the form", issues: normalizeIssues(parsed.error) };
    }
    const user = await register(parsed.data);
    return { ok: true, user };
  } catch (error) {
    return toError(error);
  }
}

export async function loginAction(input: unknown): Promise<ActionResult<{ user: unknown }>> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Please check the form", issues: normalizeIssues(parsed.error) };
    }
    const user = await login(parsed.data);
    return { ok: true, user };
  } catch (error) {
    return toError(error);
  }
}

export async function logoutAction(): Promise<ActionResult<{ signedOut: boolean }>> {
  try {
    await clearSession();
    return { ok: true, signedOut: true };
  } catch (error) {
    return toError(error);
  }
}

/** One-click demo seed for judges; idempotent. */
export async function seedDemoAction(): Promise<ActionResult<{ message: string }>> {
  try {
    const result = await seedDemoData();
    return { ok: true, message: result.message };
  } catch (error) {
    return toError(error);
  }
}

export async function meAction() {
  return getCurrentUser();
}

// ---- Invoices -----------------------------------------------------------------

/** Submits an invoice; supporting documents are uploaded in the same form. */
export async function submitInvoiceAction(
  formData: FormData,
): Promise<ActionResult<{ invoiceId: string; documentsUploaded: number }>> {
  try {
    const user = await requireUser("sme");

    const raw = {
      invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
      customerName: String(formData.get("customerName") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      customerContact: String(formData.get("customerContact") ?? ""),
      description: String(formData.get("description") ?? ""),
      faceValueCents: Math.round(Number(formData.get("faceValue") ?? 0) * 100),
      advanceCents: Math.round(Number(formData.get("advance") ?? 0) * 100),
      dueDate: String(formData.get("dueDate") ?? ""),
    };
    const parsed = createInvoiceSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Please check the invoice form", issues: normalizeIssues(parsed.error) };
    }
    const invoice = await createInvoice(user, parsed.data);

    let documentsUploaded = 0;
    for (const [field, value] of formData.entries()) {
      if (!(value instanceof File) || value.size === 0) continue;
      const kindParsed = documentKindSchema.safeParse(String(formData.get(`kind-${field}`) ?? "other"));
      const kind: "purchase_order" | "contract" | "delivery_record" | "other" = kindParsed.success
        ? kindParsed.data
        : "other";
      await uploadDocument(
        {
          name: value.name,
          mimeType: value.type || "application/octet-stream",
          sizeBytes: value.size,
          content: Buffer.from(await value.arrayBuffer()),
        },
        { invoiceId: invoice.id, kind, actor: user },
      );
      documentsUploaded += 1;
    }

    return { ok: true, invoiceId: invoice.id, documentsUploaded };
  } catch (error) {
    return toError(error);
  }
}


export async function reviewInvoiceAction(
  invoiceId: string,
  input: unknown,
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const user = await requireUser("reviewer");
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Please choose a decision", issues: normalizeIssues(parsed.error) };
    }
    await decideInvoice(user, invoiceId, parsed.data);
    return { ok: true, invoiceId };
  } catch (error) {
    return toError(error);
  }
}

export async function fundInvoiceAction(
  invoiceId: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const user = await requireUser("investor");
    await fundInvoice(user, invoiceId);
    return { ok: true, invoiceId };
  } catch (error) {
    return toError(error);
  }
}

export async function settleInvoiceAction(
  invoiceId: string,
  input: unknown = {},
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const user = await requireUser("sme");
    const parsed = settleSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return { ok: false, error: "Check the settlement details", issues: normalizeIssues(parsed.error) };
    }
    await settleInvoice(user, invoiceId, parsed.data);
    return { ok: true, invoiceId };
  } catch (error) {
    return toError(error);
  }
}
