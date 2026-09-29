-- Community lead sources verbatim, lead match confirmation flags, import batch tags.
-- Safe to re-run.

ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'pinterest';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'showroom_walk_in';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'self_generated';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'web';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'online';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'paid_instagram_ads';
ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'google_business_profile';

CREATE TABLE IF NOT EXISTS "ic_lead_match_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "ic_leads"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL CHECK ("target_type" IN ('job', 'client', 'lead')),
  "target_id" uuid NOT NULL,
  "matched_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mismatched_fields" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'linked', 'kept_separate')),
  "resolved_by" uuid REFERENCES "ic_staff"("id"),
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("lead_id", "target_type", "target_id")
);
CREATE INDEX IF NOT EXISTS "ic_lead_match_candidates_pending_idx"
  ON "ic_lead_match_candidates" ("status", "lead_id");

ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "data_flags" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "import_batch" text;
ALTER TABLE "ic_clients" ADD COLUMN IF NOT EXISTS "import_batch" text;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "import_batch" text;
ALTER TABLE "ic_appointments" ADD COLUMN IF NOT EXISTS "import_batch" text;
ALTER TABLE "ic_staff" ADD COLUMN IF NOT EXISTS "import_batch" text;
