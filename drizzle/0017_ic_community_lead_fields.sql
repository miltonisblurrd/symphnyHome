-- Community “New Leads Created” report fields that were not on ic_leads.
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "source_raw" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "stage_raw" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "lead_owner_name" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "address_raw" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "last_modified_at" timestamptz;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "community_created_by" text;
