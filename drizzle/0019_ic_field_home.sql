-- Installer Field home: real login, PTO, notices, crew requests, pay profile.
-- Run in Supabase SQL editor. Safe to re-run.

ALTER TABLE "ic_staff"
  ADD COLUMN IF NOT EXISTS "password_hash" text;

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "field_notes" text;

CREATE TABLE IF NOT EXISTS "ic_staff_pay" (
  "staff_id" uuid PRIMARY KEY REFERENCES "ic_staff"("id"),
  "classification" text,
  "last_pay_cents" integer NOT NULL DEFAULT 0,
  "last_pay_date" date,
  "next_pay_date" date,
  "bank_last4" text,
  "routing_last4" text,
  "bank_status" text NOT NULL DEFAULT 'none',
  "bank_updated_at" timestamptz,
  "home_address" text,
  "emergency_name" text,
  "emergency_phone" text,
  "emergency_relation" text,
  "truck_label" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ic_time_off" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "kind" text NOT NULL DEFAULT 'pto',
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "note" text,
  "status" text NOT NULL DEFAULT 'requested',
  "decided_by" uuid REFERENCES "ic_staff"("id"),
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ic_field_notices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "kind" text NOT NULL DEFAULT 'notice',
  "title" text NOT NULL,
  "body" text NOT NULL,
  "related_id" uuid,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ic_company_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "body" text NOT NULL,
  "author_id" uuid REFERENCES "ic_staff"("id"),
  "author_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "ic_job_crew" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "status" text NOT NULL DEFAULT 'requested',
  "requested_by" uuid REFERENCES "ic_staff"("id"),
  "decided_by" uuid REFERENCES "ic_staff"("id"),
  "decided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ic_job_crew_job_installer"
  ON "ic_job_crew" ("job_id", "installer_id");

CREATE TABLE IF NOT EXISTS "ic_staff_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_id" uuid REFERENCES "ic_staff"("id"),
  "kind" text NOT NULL DEFAULT 'other',
  "title" text NOT NULL,
  "public_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "ic_staff_documents" ("kind", "title", "public_url")
SELECT 'handbook', 'Safety handbook', '/inspired-closets/installers/handbook'
WHERE NOT EXISTS (
  SELECT 1 FROM "ic_staff_documents" WHERE "kind" = 'handbook' AND "staff_id" IS NULL
);

UPDATE "ic_staff_documents"
SET "public_url" = '/inspired-closets/installers/handbook'
WHERE "kind" = 'handbook'
  AND "public_url" = '/inspired-closets/field/handbook';
