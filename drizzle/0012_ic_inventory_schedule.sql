-- Inventory trust + schedule inputs.
-- Size on parts, reserve/unreserve movements, job material lines, crew/duration on jobs.

ALTER TABLE "ic_parts" ADD COLUMN IF NOT EXISTS "size" text;

DO $$ BEGIN
  ALTER TYPE "public"."ic_stock_movement_type" ADD VALUE IF NOT EXISTS 'reserve';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "public"."ic_stock_movement_type" ADD VALUE IF NOT EXISTS 'unreserve';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reserved now means "promised to a job, still on the shelf".
-- Old allocate rows had inflated this; reset so available = on_hand - reserved is honest.
UPDATE "ic_parts" SET "qty_reserved" = 0 WHERE "qty_reserved" <> 0;

ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "crew_size" integer DEFAULT 2;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "estimated_install_days" integer DEFAULT 1;

CREATE TABLE IF NOT EXISTS "ic_job_materials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "part_id" uuid NOT NULL REFERENCES "ic_parts"("id"),
  "qty" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "staged_by" uuid REFERENCES "ic_staff"("id"),
  "staged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_job_materials_job_idx"
  ON "ic_job_materials" ("job_id", "status");
CREATE INDEX IF NOT EXISTS "ic_job_materials_part_idx"
  ON "ic_job_materials" ("part_id");

ALTER TABLE "ic_job_materials" ENABLE ROW LEVEL SECURITY;
