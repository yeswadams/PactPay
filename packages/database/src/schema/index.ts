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
  numeric,
  uniqueIndex,
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
  "draft",
  "needs_information",
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
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  walletAddress: text("wallet_address").unique(),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  settings: jsonb("settings")
    .$type<{ timezone: string }>()
    .default({ timezone: "Africa/Nairobi" })
    .notNull(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").default("password").notNull(),
    walletAddress: text("wallet_address"),
    chainId: integer("chain_id"),
    organizationId: uuid("organization_id").references(() => businesses.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  registrationNumber: text("registration_number").notNull(),
  kind: text("kind").default("sme").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  verificationStatus: text("verification_status").default("PENDING").notNull(),
  discloseName: boolean("disclose_name").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    commitment: text("commitment").unique(),
    salt: text("salt"),
    terms: jsonb("terms").$type<OfferTerms>(),
    verificationEvidence: text("verification_evidence"),
    verifiedBy: text("verified_by"),
    idempotencyKey: text("idempotency_key").unique(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    content: bytea("content"),
    objectKey: text("object_key").unique(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
  settledAt: timestamp("settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Machine-readable event type, e.g. "invoice.submitted". */
    type: text("type").notNull(),
    /** Human-readable explanation shown in the UI. */
    message: text("message").notNull(),
    /** Testnet transaction hash once the contract integration lands; null until then. */
    txHash: text("tx_hash"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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

export type OfferTerms = {
  token: string;
  beneficiary: string;
  treasury: string;
  target: string;
  repayment: string;
  fee: string;
  fundingDeadline: string;
  maturity: string;
};
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const amount = (name: string) =>
  numeric(name, { precision: 78, scale: 0 }).notNull();

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  subject: text("subject").notNull(),
  details: jsonb("details").notNull(),
  createdAt: createdAt(),
});
export const contractDeployments = pgTable("contract_deployments", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  address: text("address").notNull(),
  manifest: jsonb("manifest").notNull(),
  createdAt: createdAt(),
});
export const invoiceOnchainRecords = pgTable(
  "invoice_onchain_records",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .references(() => contractDeployments.id)
      .notNull(),
    commitment: text("commitment").notNull(),
    state: integer("state").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    blockNumber: amount("block_number"),
    blockHash: text("block_hash").notNull(),
  },
  (t) => [
    uniqueIndex("onchain_invoice_unique").on(t.deploymentId, t.commitment),
  ],
);
export const investorPositions = pgTable(
  "investor_positions",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .references(() => invoiceOnchainRecords.id, { onDelete: "cascade" })
      .notNull(),
    wallet: text("wallet").notNull(),
    contribution: amount("contribution"),
    claimable: amount("claimable"),
    refunded: boolean("refunded").notNull(),
    claimed: boolean("claimed").notNull(),
  },
  (t) => [uniqueIndex("investor_position_unique").on(t.recordId, t.wallet)],
);
export const blockchainTransactions = pgTable("blockchain_transactions", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .references(() => contractDeployments.id)
    .notNull(),
  hash: text("hash").notNull(),
  blockNumber: amount("block_number"),
  blockHash: text("block_hash").notNull(),
  status: text("status").notNull(),
  sender: text("sender"),
  createdAt: createdAt(),
});
export const blockchainEvents = pgTable("blockchain_events", {
  id: text("id").primaryKey(),
  deploymentId: text("deployment_id")
    .references(() => contractDeployments.id)
    .notNull(),
  transactionHash: text("transaction_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  blockNumber: amount("block_number"),
  blockHash: text("block_hash").notNull(),
  name: text("name").notNull(),
  args: jsonb("args").notNull(),
});
export const blockchainEventCheckpoints = pgTable(
  "blockchain_event_checkpoints",
  {
    id: text("id").primaryKey(),
    blockNumber: amount("block_number"),
    blockHash: text("block_hash").notNull(),
  },
);
export const settlementReconciliations = pgTable(
  "settlement_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .references(() => invoices.id)
      .notNull(),
    deploymentId: text("deployment_id")
      .references(() => contractDeployments.id)
      .notNull(),
    evidenceReference: text("evidence_reference").notNull().unique(),
    evidenceCommitment: text("evidence_commitment").notNull().unique(),
    amount: amount("amount"),
    operator: text("operator").notNull(),
    status: text("status").default("PREPARED").notNull(),
    transactionHash: text("transaction_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("one_reconciliation_per_invoice_deployment").on(
      t.invoiceId,
      t.deploymentId,
    ),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    eligibilityStatus: text("eligibility_status").default("PENDING").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("organization_member_unique").on(t.organizationId, t.userId),
  ],
);
export const operatorGrants = pgTable(
  "operator_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    grantedBy: text("granted_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("operator_scope_unique").on(t.userId, t.scope)],
);
export const walletChallenges = pgTable(
  "wallet_challenges",
  {
    id: text("id").primaryKey(),
    nonce: text("nonce").notNull().unique(),
    wallet: text("wallet").notNull(),
    message: text("message").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("wallet_challenge_wallet_time").on(t.wallet, t.createdAt)],
);
