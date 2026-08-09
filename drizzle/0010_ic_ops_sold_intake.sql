-- Middle glue: sold project intake fields for Des desk.
-- Safe to re-run.

ALTER TABLE "ic_jobs"
  ADD COLUMN IF NOT EXISTS "studio_ref" text,
  ADD COLUMN IF NOT EXISTS "receive_date" date,
  ADD COLUMN IF NOT EXISTS "job_check_owner_id" uuid REFERENCES "ic_staff"("id"),
  ADD COLUMN IF NOT EXISTS "tentative_install_notes" text,
  ADD COLUMN IF NOT EXISTS "site_ready_notes" text,
  ADD COLUMN IF NOT EXISTS "deposit_intake_status" text;

COMMENT ON COLUMN "ic_jobs"."deposit_intake_status" IS
  'Des intake: pending | link_sent | check_pending | paid — Billing remains source of truth for paid.';

CREATE INDEX IF NOT EXISTS "ic_jobs_ready_schedule_idx"
  ON "ic_jobs" ("stage", "install_date")
  WHERE "deleted_at" IS NULL AND "install_date" IS NULL;
