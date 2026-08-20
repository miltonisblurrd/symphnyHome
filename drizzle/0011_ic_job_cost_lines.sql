-- Job cost lines for Stow / pallet / freight (parallel OS, no Stow API).

CREATE TABLE IF NOT EXISTS "ic_job_cost_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "cost_type" text NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "vendor_ref" text,
  "note" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_job_cost_lines_job_idx"
  ON "ic_job_cost_lines" ("job_id", "created_at" DESC);
