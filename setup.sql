-- FreelanceInvoice — one-time database setup
--
-- WHAT THIS IS: everything the app needs to create its tables, in one file.
-- WHO IT'S FOR: anyone setting up without using a terminal.
--
-- HOW TO USE IT:
--   1. Open your Neon project at console.neon.tech
--   2. Click "SQL Editor" in the left sidebar
--   3. Paste this whole file in
--   4. Click "Run"
--
-- It is safe to run once. Running it a second time will error on the first
-- table (because it already exists) — that error is harmless and means your
-- database is already set up.
--
-- This leaves the database in exactly the state `npm run db:migrate` produces,
-- so a developer can pick up future migrations normally later.

BEGIN;

-- ===== schema, part 1 of 2 =====
CREATE TYPE "public"."document_kind" AS ENUM('invoice', 'quote', 'proposal', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('created', 'sent', 'delivered', 'bounced', 'complained', 'email_opened', 'viewed', 'pdf_downloaded', 'payment_started', 'paid', 'marked_paid_manually', 'reminder_sent', 'reminder_skipped', 'voided', 'edited_after_send');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'manual');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"company" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"meta" jsonb
);

CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"client_id" uuid,
	"kind" "document_kind" DEFAULT 'invoice' NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"number" text,
	"client_name" text,
	"client_email" text,
	"client_address" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"terms" text,
	"tax_label" text DEFAULT 'Tax' NOT NULL,
	"niche_slug" text,
	"theme_id" text DEFAULT 'minimal' NOT NULL,
	"accent_color" text DEFAULT '#0f172a' NOT NULL,
	"public_token" text NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_tone" text DEFAULT 'friendly' NOT NULL,
	"sent_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"snapshot" jsonb,
	"draft_business" jsonb,
	"anonymous_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"claim_draft_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"method" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);

CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"rule_key" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"channel" text DEFAULT 'email' NOT NULL,
	"provider_message_id" text,
	"error" text
);

CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "stripe_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone
);

CREATE TABLE "subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"status" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"business_name" text,
	"business_address" text,
	"business_email" text,
	"business_phone" text,
	"logo_url" text,
	"accent_color" text DEFAULT '#0f172a' NOT NULL,
	"theme_id" text DEFAULT 'minimal' NOT NULL,
	"niche_slug" text,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"default_payment_terms_days" integer DEFAULT 14 NOT NULL,
	"default_tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_label" text DEFAULT 'Tax' NOT NULL,
	"bank_details" text,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"reminders_enabled_by_default" boolean DEFAULT true NOT NULL,
	"reminder_tone" text DEFAULT 'friendly' NOT NULL,
	"invoice_number_format" text DEFAULT 'INV-{YYYY}-{0000}' NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "webhook_events" (
	"provider" text NOT NULL,
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);

ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_owner_idx" ON "clients" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_owner_email_unique" ON "clients" USING btree ("owner_id","email");--> statement-breakpoint
CREATE INDEX "document_events_document_idx" ON "document_events" USING btree ("document_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_public_token_unique" ON "documents" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_anon_idx" ON "documents" USING btree ("anonymous_session_id");--> statement-breakpoint
CREATE INDEX "documents_usage_idx" ON "documents" USING btree ("owner_id","kind","sent_at");--> statement-breakpoint
CREATE INDEX "documents_status_due_idx" ON "documents" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "line_items_document_idx" ON "line_items" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_unique" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "payments_document_idx" ON "payments" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_checkout_session_unique" ON "payments" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_document_rule_unique" ON "reminders" USING btree ("document_id","rule_key");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
-- ===== schema, part 2 of 2 =====
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "login_tokens" ADD COLUMN "anonymous_session_id" text;

-- ===== bookkeeping so future migrations know these were applied =====
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
VALUES ('ea26b6bc21a02ae77b61f95fe386d9348db1fe16e4454c7b5f06aae4f539515a', 1786153735361), ('a0d0ccdae8a411ed6b37301d77f35d46ee7b429669a1b579b12f9030a15dcfc8', 1786157670727);

COMMIT;

-- Done. Your database is ready.
