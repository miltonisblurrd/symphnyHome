ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "first_name" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "last_name" text;
ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "referral_name" text;

ALTER TABLE "ic_appointments" ADD COLUMN IF NOT EXISTS "subject" text;
ALTER TABLE "ic_appointments" ADD COLUMN IF NOT EXISTS "location_text" text;

ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "proposal_url" text;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "proposal_path" text;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "proposal_filename" text;
