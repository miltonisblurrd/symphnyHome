-- Inspired Closets OS — Des lead desk: Community-aligned statuses, sources, detail fields, Chatter.
-- Safe after 0007. Adds enum values; keeps legacy values for existing rows.

-- ── Sources ──────────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'vehicle'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'referral_company'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'referral_personal'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'chatgpt'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'organic_search'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'paid_search'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_source" ADD VALUE IF NOT EXISTS 'facebook'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Statuses (Community ladder) ──────────────────────────────────────────
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'attempt_1'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'attempt_2'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'attempt_3'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'attempt_4'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'attempt_5'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'moved_to_studio'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'canceled_appointment'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'new_construction'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'duplicate'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'prospect'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."ic_lead_stage" ADD VALUE IF NOT EXISTS 'rescheduled'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Map legacy stages → Community-aligned
UPDATE "ic_leads" SET "stage" = 'attempt_1' WHERE "stage" = 'follow_up';
UPDATE "ic_leads" SET "stage" = 'appointment_set' WHERE "stage" = 'schedule';
UPDATE "ic_leads" SET "source" = 'referral_personal' WHERE "source" = 'referral';
UPDATE "ic_leads" SET "source" = 'facebook' WHERE "source" = 'meta';

-- ── Lead detail fields ───────────────────────────────────────────────────
ALTER TABLE "ic_leads"
  ADD COLUMN IF NOT EXISTS "lead_type" text DEFAULT 'consumer',
  ADD COLUMN IF NOT EXISTS "influencer_type" text,
  ADD COLUMN IF NOT EXISTS "form_type" text,
  ADD COLUMN IF NOT EXISTS "street" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "state" text,
  ADD COLUMN IF NOT EXISTS "zip" text,
  ADD COLUMN IF NOT EXISTS "country" text DEFAULT 'United States',
  ADD COLUMN IF NOT EXISTS "community_name" text,
  ADD COLUMN IF NOT EXISTS "showroom_visit" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "show_room" text DEFAULT 'Las Vegas Showroom',
  ADD COLUMN IF NOT EXISTS "areas_of_home" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "nurturing_reason" text,
  ADD COLUMN IF NOT EXISTS "junk_reason" text,
  ADD COLUMN IF NOT EXISTS "needs_follow_up_date" date,
  ADD COLUMN IF NOT EXISTS "contact_preference" text,
  ADD COLUMN IF NOT EXISTS "converted_at" timestamp with time zone,
  -- Craig pipeline labels (his tab only; pulled from lead/job)
  ADD COLUMN IF NOT EXISTS "pipeline_status" text,
  ADD COLUMN IF NOT EXISTS "pipeline_signed" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "pipeline_rto" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "pipeline_sold_cents" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "pipeline_deposit_cents" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "pipeline_margin_bps" integer,
  ADD COLUMN IF NOT EXISTS "pipeline_source_label" text;

-- Copy community_ref → community_name when empty
UPDATE "ic_leads"
SET "community_name" = "community_ref"
WHERE ("community_name" IS NULL OR "community_name" = '')
  AND "community_ref" IS NOT NULL AND "community_ref" <> '';

-- Copy junk reason from disqualification_reason
UPDATE "ic_leads"
SET "junk_reason" = "disqualification_reason"
WHERE "junk_reason" IS NULL AND "disqualification_reason" IS NOT NULL;

-- ── Chatter (notes / posts on a lead) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ic_lead_chatter" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lead_id" uuid NOT NULL REFERENCES "ic_leads"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "ic_staff"("id"),
  "author_name" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "ic_lead_chatter_lead_idx"
  ON "ic_lead_chatter" ("lead_id", "created_at" DESC);

ALTER TABLE "ic_lead_chatter" ENABLE ROW LEVEL SECURITY;
