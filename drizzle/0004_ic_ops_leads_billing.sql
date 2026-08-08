-- Inspired Closets OS — Phase 4: leads, appointments, billing ledger.
-- Safe to run after 0001 + 0002 + 0003.

DO $$ BEGIN
  CREATE TYPE "public"."ic_lead_source" AS ENUM(
    'call', 'website', 'google', 'meta', 'instagram', 'yelp',
    'billboard', 'referral', 'email', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_lead_stage" AS ENUM(
    'new', 'schedule', 'follow_up', 'nurturing', 'not_interested',
    'junk', 'appointment_set'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_appointment_kind" AS ENUM(
    'consultation', 'job_check', 'install'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_appointment_location" AS ENUM(
    'on_site', 'showroom', 'virtual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_appointment_status" AS ENUM(
    'scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_payment_milestone" AS ENUM(
    'deposit_50', 'install_40', 'completion_10'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_payment_status" AS ENUM(
    'pending', 'partial', 'paid', 'void'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_payment_method" AS ENUM(
    'podium', 'check', 'card', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid REFERENCES "ic_clients"("id"),
  "source" "ic_lead_source" DEFAULT 'call' NOT NULL,
  "stage" "ic_lead_stage" DEFAULT 'new' NOT NULL,
  "owner_id" uuid REFERENCES "ic_staff"("id"),
  "designer_id" uuid REFERENCES "ic_staff"("id"),
  "contact_attempts" integer DEFAULT 0 NOT NULL,
  "next_action_at" timestamp with time zone,
  "next_action_note" text,
  "disqualification_reason" text,
  "project_area" text,
  "motivation" text,
  "desired_timeline" text,
  "community_ref" text,
  "converted_job_id" uuid REFERENCES "ic_jobs"("id"),
  "risk_flag" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "lead_id" uuid REFERENCES "ic_leads"("id");

CREATE TABLE IF NOT EXISTS "ic_appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid REFERENCES "ic_leads"("id"),
  "client_id" uuid REFERENCES "ic_clients"("id"),
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "designer_id" uuid REFERENCES "ic_staff"("id"),
  "kind" "ic_appointment_kind" DEFAULT 'consultation' NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "location_type" "ic_appointment_location" DEFAULT 'on_site' NOT NULL,
  "status" "ic_appointment_status" DEFAULT 'scheduled' NOT NULL,
  "delay_reason" text,
  "confirmation_sent_at" timestamp with time zone,
  "confirmation_note" text,
  "community_ref" text,
  "notes" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "milestone" "ic_payment_milestone" NOT NULL,
  "amount_due_cents" integer DEFAULT 0 NOT NULL,
  "amount_paid_cents" integer DEFAULT 0 NOT NULL,
  "status" "ic_payment_status" DEFAULT 'pending' NOT NULL,
  "method" "ic_payment_method",
  "podium_ref" text,
  "check_ref" text,
  "due_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "link_sent_at" timestamp with time zone,
  "last_reminder_at" timestamp with time zone,
  "reminder_level" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ic_payments_job_milestone_uidx"
  ON "ic_payments" ("job_id", "milestone");

CREATE INDEX IF NOT EXISTS "ic_leads_stage_idx" ON "ic_leads" ("stage");
CREATE INDEX IF NOT EXISTS "ic_leads_source_idx" ON "ic_leads" ("source");
CREATE INDEX IF NOT EXISTS "ic_leads_owner_idx" ON "ic_leads" ("owner_id");
CREATE INDEX IF NOT EXISTS "ic_leads_next_action_idx" ON "ic_leads" ("next_action_at");
CREATE INDEX IF NOT EXISTS "ic_appointments_scheduled_idx" ON "ic_appointments" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "ic_appointments_designer_idx" ON "ic_appointments" ("designer_id");
CREATE INDEX IF NOT EXISTS "ic_payments_job_idx" ON "ic_payments" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_payments_status_idx" ON "ic_payments" ("status");
CREATE INDEX IF NOT EXISTS "ic_payments_due_idx" ON "ic_payments" ("due_at");
CREATE INDEX IF NOT EXISTS "ic_jobs_lead_idx" ON "ic_jobs" ("lead_id");

ALTER TABLE "ic_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_payments" ENABLE ROW LEVEL SECURITY;
