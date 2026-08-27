CREATE TABLE IF NOT EXISTS "ic_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'customer' NOT NULL,
  "partner_type" text,
  "phone" text,
  "email" text,
  "notes" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "ic_accounts_kind_idx" ON "ic_accounts" ("kind");

ALTER TABLE "ic_leads" ADD COLUMN IF NOT EXISTS "account_id" uuid;
ALTER TABLE "ic_jobs" ADD COLUMN IF NOT EXISTS "account_id" uuid;
