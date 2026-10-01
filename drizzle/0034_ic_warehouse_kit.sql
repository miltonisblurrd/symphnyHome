-- Bryant's warehouse kit: role, pile status on the job, line marks on the product summary.
-- Safe to re-run. Add the enum value before setting any staff row to warehouse.

ALTER TYPE "public"."ic_role" ADD VALUE IF NOT EXISTS 'warehouse';

ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "warehouse_status" text;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "warehouse_ready_at" timestamptz;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "warehouse_ready_by" uuid REFERENCES "ic_staff"("id");
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "pile_location" text;

ALTER TABLE "ic_jobs" DROP CONSTRAINT IF EXISTS "ic_jobs_warehouse_status_check";
ALTER TABLE "ic_jobs"
  ADD CONSTRAINT "ic_jobs_warehouse_status_check"
  CHECK ("warehouse_status" IS NULL OR "warehouse_status" IN ('gathering', 'ready', 'hold'));

CREATE INDEX IF NOT EXISTS "ic_jobs_warehouse_status_idx"
  ON "ic_jobs" ("warehouse_status")
  WHERE "warehouse_status" IS NOT NULL;

ALTER TABLE "ic_job_summary_lines" ADD COLUMN IF NOT EXISTS "gather_status" text NOT NULL DEFAULT 'unset';
ALTER TABLE "ic_job_summary_lines" ADD COLUMN IF NOT EXISTS "problem_note" text;
ALTER TABLE "ic_job_summary_lines" ADD COLUMN IF NOT EXISTS "gather_marked_by" uuid REFERENCES "ic_staff"("id");
ALTER TABLE "ic_job_summary_lines" ADD COLUMN IF NOT EXISTS "gather_marked_at" timestamptz;

ALTER TABLE "ic_job_summary_lines" DROP CONSTRAINT IF EXISTS "ic_job_summary_lines_gather_status_check";
ALTER TABLE "ic_job_summary_lines"
  ADD CONSTRAINT "ic_job_summary_lines_gather_status_check"
  CHECK ("gather_status" IN ('unset', 'in_pile', 'on_truck', 'problem'));
