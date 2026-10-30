import { z } from "zod";

/** Money in KES cents, positive integers only. */
export const kesCents = z
  .number()
  .int("Amount must be a whole number of cents")
  .positive("Amount must be positive")
  .max(2_000_000_000);

export const isoDate = z.string().transform((value, ctx) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return date;
});

// ---- Auth -------------------------------------------------------------------

export const registerSchema = z
  .object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    name: z.string().min(1, "Enter your name"),
    role: z.enum(["sme", "investor"]),
    businessName: z.string().min(1, "Enter your business name").optional(),
    registrationNumber: z
      .string()
      .min(1, "Enter your registration number")
      .optional(),
  })
  .refine(
    (value) =>
      value.role !== "sme" ||
      Boolean(value.businessName && value.registrationNumber),
    {
      message: "SMEs must provide a business name and registration number",
      path: ["businessName"],
    },
  );

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

// ---- Invoices ----------------------------------------------------------------

export const createInvoiceSchema = z
  .object({
    invoiceNumber: z.string().min(1, "Enter the invoice number").max(64),
    customerName: z.string().min(1, "Enter the customer name").max(160),
    customerEmail: z
      .string()
      .email("Enter a valid customer email")
      .optional()
      .or(z.literal("")),
    customerContact: z.string().max(120).optional().or(z.literal("")),
    description: z
      .string()
      .min(10, "Describe what was supplied (at least 10 characters)")
      .max(2_000),
    faceValueCents: kesCents,
    advanceCents: kesCents,
    platformFeeBps: z.number().int().min(0).max(5000).optional(),
    dueDate: isoDate,
  })
  .refine((value) => value.advanceCents < value.faceValueCents, {
    message:
      "The advance must be less than the face value — that difference is the cost of financing",
    path: ["advanceCents"],
  });

export const documentKindSchema = z.enum([
  "purchase_order",
  "contract",
  "delivery_record",
  "other",
]);

export const uploadDocumentSchema = z.object({
  kind: documentKindSchema,
});

export const reviewSchema = z.object({
  decision: z.enum(["confirmed", "rejected"]),
  notes: z.string().max(2_000).optional().or(z.literal("")),
});

export const fundSchema = z.object({
  investorWallet: z.string().max(120).optional().or(z.literal("")),
});

export const settleSchema = z.object({
  paidCents: kesCents.optional(),
  latePayment: z.boolean().optional(),
});

export type CreateInvoiceInput = z.output<typeof createInvoiceSchema>;
export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type ReviewInput = z.output<typeof reviewSchema>;
export type SettleInput = z.output<typeof settleSchema>;
