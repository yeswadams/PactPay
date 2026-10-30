import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  customType,
  index,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Money is always stored as integer KES cents to avoid float rounding.
 * A face value of KES 500,000 is stored as 50_000_000 (cents).
 */

/** Raw document bytes, stored in Postgres for this dev prototype only. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userRole = pgEnum("user_role", ["sme", "reviewer", "investor"]);

export const invoiceStatus = pgEnum("invoice_status", [
  "submitted",
  "confirmed",
  "rejected",
  "funded",
  "settled",
]);

export const documentKind = pgEnum("document_kind", [
  "purchase_order",
  "contract",
  "delivery_record",
  "other",
]);

export const reviewDecision = pgEnum("review_decision", [
  "confirmed",
  "rejected",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  name: text("name").notNull(),
  registrationNumber: text("registration_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerContact: text("customer_contact"),
    description: text("description").notNull(),
    /** Face value owed by the customer, in KES cents. */
    faceValueCents: integer("face_value_cents").notNull(),
    /** Cash the SME wants today, in KES cents. Must be < faceValueCents. */
    advanceCents: integer("advance_cents").notNull(),
    /** Percentage (in basis points) of the spread that goes to the platform at settlement. */
    platformFeeBps: integer("platform_fee_bps").notNull().default(2000),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    /** Reviewer confirms the customer acknowledged the invoice and delivery. */
    customerVerified: boolean("customer_verified").notNull().default(false),
    status: invoiceStatus("status").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoices_business_number_unique").on(t.businessId, t.invoiceNumber),
    index("invoices_status_idx").on(t.status),
    index("invoices_business_id_idx").on(t.businessId),
  ],
);

export const invoiceDocuments = pgTable(
  "invoice_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: documentKind("kind").notNull().default("other"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 hex of the file — key detail on chain, never the content. */
    sha256: text("sha256").notNull(),
    content: bytea("content").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_documents_invoice_id_idx").on(t.invoiceId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    decision: reviewDecision("decision").notNull(),
    /** Human-readable explanation shown to the SME and investors. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_invoice_id_idx").on(t.invoiceId)],
);

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Simulated advance paid to the SME, in KES cents. */
    amountCents: integer("amount_cents").notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("investments_invoice_id_idx").on(t.invoiceId)],
);

export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" })
    .unique(),
  /** Amount actually paid by the customer, in KES cents. */
  paidCents: integer("paid_cents").notNull(),
  investorPayoutCents: integer("investor_payout_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull(),
  latePayment: boolean("late_payment").notNull().default(false),
  txHash: text("tx_hash"),
  settledAt: timestamp("settled_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit trail. Every state change writes a plain-language event so
 * SMEs and investors can follow the same history a reviewer sees.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Machine-readable event type, e.g. "invoice.submitted". */
    type: text("type").notNull(),
    /** Human-readable explanation shown in the UI. */
    message: text("message").notNull(),
    /** Testnet transaction hash once the contract integration lands; null until then. */
    txHash: text("tx_hash"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_invoice_id_idx").on(t.invoiceId)],
);

export type User = typeof users.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceDocument = typeof invoiceDocuments.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Investment = typeof investments.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type Event = typeof events.$inferSelect;
