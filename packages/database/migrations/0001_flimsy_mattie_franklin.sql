ALTER TYPE "public"."invoice_status" ADD VALUE 'draft' BEFORE 'submitted';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'needs_information' BEFORE 'submitted';--> statement-breakpoint
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
CREATE TABLE "operator_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"granted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"eligibility_status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "wallet_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"wallet" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_challenges_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_owner_id_unique";--> statement-breakpoint
ALTER TABLE "invoice_documents" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "kind" text DEFAULT 'sme' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "verification_status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "disclose_name" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD COLUMN "object_key" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "commitment" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "salt" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "verification_evidence" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "kind" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "chain_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "settings" jsonb DEFAULT '{"timezone":"Africa/Nairobi"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "blockchain_events" ADD CONSTRAINT "blockchain_events_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_positions" ADD CONSTRAINT "investor_positions_record_id_invoice_onchain_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."invoice_onchain_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_onchain_records" ADD CONSTRAINT "invoice_onchain_records_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_grants" ADD CONSTRAINT "operator_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_businesses_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reconciliations" ADD CONSTRAINT "settlement_reconciliations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_reconciliations" ADD CONSTRAINT "settlement_reconciliations_deployment_id_contract_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."contract_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investor_position_unique" ON "investor_positions" USING btree ("record_id","wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "onchain_invoice_unique" ON "invoice_onchain_records" USING btree ("deployment_id","commitment");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_scope_unique" ON "operator_grants" USING btree ("user_id","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_member_unique" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_reconciliation_per_invoice_deployment" ON "settlement_reconciliations" USING btree ("invoice_id","deployment_id");--> statement-breakpoint
CREATE INDEX "wallet_challenge_wallet_time" ON "wallet_challenges" USING btree ("wallet","created_at");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_businesses_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_object_key_unique" UNIQUE("object_key");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_commitment_unique" UNIQUE("commitment");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address");
--> statement-breakpoint
INSERT INTO "organization_members" (organization_id, user_id, role)
SELECT id, owner_id, kind FROM businesses ON CONFLICT DO NOTHING;
