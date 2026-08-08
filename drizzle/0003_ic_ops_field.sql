-- Inspired Closets OS — Phase 3: driver / installer field app.
-- Safe to run after 0001 + 0002.

DO $$ BEGIN
  CREATE TYPE "public"."ic_media_kind" AS ENUM('before', 'during', 'after', 'issue', 'staging', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_field_issue_type" AS ENUM('site_not_ready', 'missing_part', 'damage', 'access_problem', 'customer_issue', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_field_issue_status" AS ENUM('open', 'acknowledged', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "clock_in_at" timestamp with time zone NOT NULL,
  "clock_out_at" timestamp with time zone,
  "clock_in_lat" text,
  "clock_in_lng" text,
  "clock_out_lat" text,
  "clock_out_lng" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ic_job_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "installer_id" uuid REFERENCES "ic_staff"("id"),
  "kind" "ic_media_kind" DEFAULT 'other' NOT NULL,
  "storage_path" text NOT NULL,
  "public_url" text,
  "caption" text,
  "mime_type" text,
  "bytes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ic_field_issues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "installer_id" uuid REFERENCES "ic_staff"("id"),
  "issue_type" "ic_field_issue_type" DEFAULT 'other' NOT NULL,
  "description" text NOT NULL,
  "media_id" uuid REFERENCES "ic_job_media"("id"),
  "status" "ic_field_issue_status" DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "ic_time_entries_job_idx" ON "ic_time_entries" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_time_entries_installer_idx" ON "ic_time_entries" ("installer_id");
CREATE INDEX IF NOT EXISTS "ic_time_entries_open_idx" ON "ic_time_entries" ("installer_id", "clock_out_at");
CREATE INDEX IF NOT EXISTS "ic_job_media_job_idx" ON "ic_job_media" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_field_issues_job_idx" ON "ic_field_issues" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_field_issues_status_idx" ON "ic_field_issues" ("status");

ALTER TABLE "ic_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_job_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_field_issues" ENABLE ROW LEVEL SECURITY;

-- Storage bucket for field photos (run in SQL; safe if bucket exists).
INSERT INTO storage.buckets (id, name, public)
VALUES ('ic-field-media', 'ic-field-media', true)
ON CONFLICT (id) DO NOTHING;
