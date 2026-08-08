-- Inspired Closets OS — Phase 1: jobs spine + payroll + activity log.
-- Safe to run on the existing database (only creates ic_* objects).

DO $$ BEGIN
  CREATE TYPE "public"."ic_role" AS ENUM('owner', 'admin', 'operations', 'front_office', 'finance', 'inventory', 'designer', 'installer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_job_stage" AS ENUM('lead', 'consultation', 'quoted', 'deposit_pending', 'deposit_received', 'job_check', 'ordered', 'install_scheduled', 'install_in_progress', 'install_complete', 'final_payment', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_payroll_status" AS ENUM('open', 'payable', 'paid', 'held');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_staff" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "role" "ic_role" NOT NULL,
  "email" text,
  "phone" text,
  "active" boolean DEFAULT true NOT NULL,
  "workbook_tab" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "email" text,
  "address" text,
  "notes" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid REFERENCES "ic_clients"("id"),
  "designer_id" uuid REFERENCES "ic_staff"("id"),
  "installer_id" uuid REFERENCES "ic_staff"("id"),
  "stage" "ic_job_stage" DEFAULT 'lead' NOT NULL,
  "contract_cents" integer DEFAULT 0 NOT NULL,
  "deposit_cents" integer DEFAULT 0 NOT NULL,
  "collected_cents" integer DEFAULT 0 NOT NULL,
  "sold_date" date,
  "install_date" date,
  "completed_date" date,
  "community_ref" text,
  "workbook_ref" text,
  "notes" text,
  "risk_flag" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_payroll_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "designer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "client_name" text NOT NULL,
  "entry_date" date,
  "contract_cents" integer DEFAULT 0 NOT NULL,
  "deposit_cents" integer DEFAULT 0 NOT NULL,
  "margin_starting_bp" integer,
  "contract_after_spiff_cents" integer,
  "margin_after_spiff_bp" integer,
  "deposit_after_spiff_cents" integer,
  "margin_final_bp" integer,
  "commission_pct_bp" integer,
  "check_cents" integer DEFAULT 0 NOT NULL,
  "pay_date" date,
  "status" "ic_payroll_status" DEFAULT 'open' NOT NULL,
  "gate_override_by" uuid REFERENCES "ic_staff"("id"),
  "gate_override_reason" text,
  "notes" text,
  "import_key" text UNIQUE,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_activity_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" text NOT NULL,
  "actor_id" uuid REFERENCES "ic_staff"("id"),
  "actor_label" text,
  "changes" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_payroll_entries_designer_idx" ON "ic_payroll_entries" ("designer_id");
CREATE INDEX IF NOT EXISTS "ic_payroll_entries_entry_date_idx" ON "ic_payroll_entries" ("entry_date");
CREATE INDEX IF NOT EXISTS "ic_jobs_stage_idx" ON "ic_jobs" ("stage");
CREATE INDEX IF NOT EXISTS "ic_activity_log_entity_idx" ON "ic_activity_log" ("entity_type", "entity_id");
