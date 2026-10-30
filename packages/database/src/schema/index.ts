import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  jsonb,
  integer,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: text("external_id").notNull().unique(),
  role: text("role").notNull(),
  createdAt: createdAt(),
});
export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .references(() => users.id)
    .notNull(),
  canonicalReference: text("canonical_reference").notNull().unique(),
  commitment: text("commitment").notNull().unique(),
  salt: text("salt").notNull(),
  faceValueKesMinor: amount("face_value_kes_minor"),
  documentReference: text("document_reference").notNull(),
  status: text("status").default("SUBMITTED").notNull(),
  verificationEvidence: text("verification_evidence"),
  verifiedBy: text("verified_by"),
  terms: jsonb("terms").$type<OfferTerms>(),
  createdAt: createdAt(),
});
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
