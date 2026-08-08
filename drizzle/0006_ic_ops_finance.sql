-- Inspired Closets OS — Phase 5: Lulu finance workspace.
-- Built around July 15 notes: Podium→QB entry, 45% spiff gate, job costing, exception queue.
-- Safe after 0004 (payments). 0005 optional.

ALTER TABLE "ic_payments"
  ADD COLUMN IF NOT EXISTS "quickbooks_ref" text;

CREATE TABLE IF NOT EXISTS "ic_job_financials" (
  "job_id" uuid PRIMARY KEY REFERENCES "ic_jobs"("id"),
  /** When set, overrides inventory-derived material cost. */
  "material_cents" integer,
  /** When set, overrides time × labor rate. */
  "labor_cents" integer,
  "other_fees_cents" integer DEFAULT 0 NOT NULL,
  "spiff_cents" integer DEFAULT 0 NOT NULL,
  "spiff_recipient" text,
  "spiff_status" text DEFAULT 'none' NOT NULL,
  /** Stow/materials reviewed & itemized against this job. */
  "costs_verified" boolean DEFAULT false NOT NULL,
  "stow_invoice_ref" text,
  "notes" text,
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  CREATE TYPE "public"."ic_recon_exception_type" AS ENUM(
    'needs_qb_entry',
    'missing_podium_ref',
    'final_unpaid',
    'below_margin_gate',
    'unverified_costs',
    'spiff_approval',
    'duplicate_risk',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_recon_exception_status" AS ENUM(
    'open',
    'investigating',
    'resolved',
    'wont_fix'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_reconciliation_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exception_type" "ic_recon_exception_type" DEFAULT 'other' NOT NULL,
  "status" "ic_recon_exception_status" DEFAULT 'open' NOT NULL,
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "payment_id" uuid REFERENCES "ic_payments"("id"),
  "payroll_entry_id" uuid REFERENCES "ic_payroll_entries"("id"),
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "title" text NOT NULL,
  "detail" text,
  "owner_id" uuid REFERENCES "ic_staff"("id"),
  "podium_ref" text,
  "quickbooks_ref" text,
  "resolved_at" timestamp with time zone,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_recon_exceptions_status_idx"
  ON "ic_reconciliation_exceptions" ("status");
CREATE INDEX IF NOT EXISTS "ic_recon_exceptions_job_idx"
  ON "ic_reconciliation_exceptions" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_payments_qb_ref_idx"
  ON "ic_payments" ("quickbooks_ref");

ALTER TABLE "ic_job_financials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_reconciliation_exceptions" ENABLE ROW LEVEL SECURITY;
