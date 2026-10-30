CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_event_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_events" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"name" text NOT NULL,
	"args" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockchain_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"hash" text NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL,
	"status" text NOT NULL,
	"sender" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"address" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"wallet" text NOT NULL,
	"contribution" numeric(78, 0) NOT NULL,
	"claimable" numeric(78, 0) NOT NULL,
	"refunded" boolean NOT NULL,
	"claimed" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_onchain_records" (
	"id" text PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"commitment" text NOT NULL,
	"state" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"block_number" numeric(78, 0) NOT NULL,
	"block_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"canonical_reference" text NOT NULL,
	"commitment" text NOT NULL,
	"salt" text NOT NULL,
	"face_value_kes_minor" numeric(78, 0) NOT NULL,
	"document_reference" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"verification_evidence" text,
	"verified_by" text,
	"terms" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_canonical_reference_unique" UNIQUE("canonical_reference"),
	CONSTRAINT "invoices_commitment_unique" UNIQUE("commitment")
);
--> statement-breakpoint
CREATE TABLE "settlement_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"deployment_id" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"evidence_commitment" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"operator" text NOT NULL,
	"status" text DEFAULT 'PREPARED' NOT NULL,
	"transaction_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_reconciliations_evidence_reference_unique" UNIQUE("evidence_reference"),
	CONSTRAINT "settlement_reconciliations_evidence_commitment_unique" UNIQUE("evidence_commitment")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_positions" ADD CONSTRAINT "investor_positions_record_id_invoice_onchain_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."invoice_onchain_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_onchain_records" ADD CONSTRAINT "invoice_onchain_records_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reconciliations" ADD CONSTRAINT "settlement_reconciliations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reconciliations" ADD CONSTRAINT "settlement_reconciliations_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investor_position_unique" ON "investor_positions" USING btree ("record_id","wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "onchain_invoice_unique" ON "invoice_onchain_records" USING btree ("deployment_id","commitment");--> statement-breakpoint
CREATE UNIQUE INDEX "one_reconciliation_per_invoice_deployment" ON "settlement_reconciliations" USING btree ("invoice_id","deployment_id");