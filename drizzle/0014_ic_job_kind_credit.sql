ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "job_kind" text DEFAULT 'new_install';
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "visit_window" text;

ALTER TABLE "ic_shipment_items" ADD COLUMN IF NOT EXISTS "needs_credit" boolean DEFAULT false NOT NULL;
