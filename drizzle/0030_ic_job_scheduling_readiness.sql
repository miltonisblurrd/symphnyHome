-- Tentative scheduling, project tiers, stage timestamps, in-OS notifications.
-- Safe to re-run.

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "install_confidence" text NOT NULL DEFAULT 'tentative'
    CHECK ("install_confidence" IN ('tentative', 'confirmed'));

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "project_tier" text NOT NULL DEFAULT 'unknown'
    CHECK ("project_tier" IN ('basic', 'middle', 'custom', 'unknown'));

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "tier_override" boolean NOT NULL DEFAULT false;

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "tier_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "deposit_received_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "job_check_scheduled_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "job_check_completed_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "rto_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "ordered_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "first_received_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "fully_received_at" timestamptz;

CREATE TABLE IF NOT EXISTS "ic_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid REFERENCES "ic_jobs"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "severity" text NOT NULL DEFAULT 'info',
  "threshold_days" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "read_at" timestamptz,
  "dismissed_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "ic_notifications_job_kind_idx"
  ON "ic_notifications" ("job_id", "kind");

CREATE INDEX IF NOT EXISTS "ic_notifications_open_idx"
  ON "ic_notifications" ("created_at" DESC)
  WHERE "dismissed_at" IS NULL;
