-- Inspired Closets OS — packing-slip receiving (ModulusScan rebuild).
-- Shipments live in the OS so scans write inventory, job readiness, and notifications.

DO $$ BEGIN
  CREATE TYPE "public"."ic_shipment_status" AS ENUM (
    'parsing',
    'ready',
    'in_progress',
    'complete'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_shipment_item_status" AS ENUM (
    'expected',
    'received',
    'damaged',
    'missing'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ic_shipment_scan_result" AS ENUM (
    'matched',
    'already_received',
    'unknown',
    'pallet_mismatch'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notice" text,
  "ship_date" date,
  "vendor" text DEFAULT 'stow' NOT NULL,
  "status" "public"."ic_shipment_status" DEFAULT 'parsing' NOT NULL,
  "source_filename" text,
  "storage_path" text,
  "public_url" text,
  "total_pages" integer DEFAULT 0 NOT NULL,
  "parse_error" text,
  "parse_quality" jsonb,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_shipment_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL REFERENCES "ic_shipments"("id") ON DELETE CASCADE,
  "item_number" text NOT NULL,
  "so_number" text,
  "cust_ref" text,
  "job_name" text,
  "project_number" text,
  "description" text,
  "qty" integer DEFAULT 1 NOT NULL,
  "received_qty" integer DEFAULT 0 NOT NULL,
  "damaged_qty" integer DEFAULT 0 NOT NULL,
  "container_id" text,
  "source_page" integer,
  "status" "public"."ic_shipment_item_status" DEFAULT 'expected' NOT NULL,
  "vendor_sku" text,
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "part_id" uuid REFERENCES "ic_parts"("id"),
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ic_shipment_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL REFERENCES "ic_shipments"("id") ON DELETE CASCADE,
  "item_id" uuid REFERENCES "ic_shipment_items"("id") ON DELETE SET NULL,
  "scanned_value" text NOT NULL,
  "result" "public"."ic_shipment_scan_result" DEFAULT 'matched' NOT NULL,
  "qty" integer DEFAULT 1 NOT NULL,
  "actor_id" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ic_shipment_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shipment_id" uuid NOT NULL REFERENCES "ic_shipments"("id") ON DELETE CASCADE,
  "item_id" uuid REFERENCES "ic_shipment_items"("id") ON DELETE SET NULL,
  "claim_type" text DEFAULT 'DAMAGED' NOT NULL,
  "description" text NOT NULL,
  "damaged_qty" integer DEFAULT 1 NOT NULL,
  "photo_url" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "reorder" boolean DEFAULT false NOT NULL,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_shipments_status_idx" ON "ic_shipments" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "ic_shipments_notice_idx" ON "ic_shipments" ("notice");
CREATE INDEX IF NOT EXISTS "ic_shipment_items_shipment_idx" ON "ic_shipment_items" ("shipment_id");
CREATE INDEX IF NOT EXISTS "ic_shipment_items_item_number_idx" ON "ic_shipment_items" ("item_number");
CREATE INDEX IF NOT EXISTS "ic_shipment_items_job_idx" ON "ic_shipment_items" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_shipment_items_part_idx" ON "ic_shipment_items" ("part_id");
CREATE INDEX IF NOT EXISTS "ic_shipment_scans_shipment_idx" ON "ic_shipment_scans" ("shipment_id", "created_at");
CREATE INDEX IF NOT EXISTS "ic_shipment_claims_shipment_idx" ON "ic_shipment_claims" ("shipment_id");

ALTER TABLE "ic_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_shipment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_shipment_scans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_shipment_claims" ENABLE ROW LEVEL SECURITY;
