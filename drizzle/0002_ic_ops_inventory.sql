-- Inspired Closets OS — Phase 2: inventory for Frank / warehouse.
-- Safe to run after 0001 (only creates new ic_* inventory objects).

DO $$ BEGIN
  CREATE TYPE "public"."ic_stock_movement_type" AS ENUM('receive', 'allocate', 'return', 'adjust', 'scrap', 'sell_excess');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ic_parts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sku" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "category" text DEFAULT 'hardware' NOT NULL,
  "location" text,
  "barcode" text,
  "unit_cost_cents" integer DEFAULT 0 NOT NULL,
  "qty_on_hand" integer DEFAULT 0 NOT NULL,
  "qty_reserved" integer DEFAULT 0 NOT NULL,
  "reorder_point" integer DEFAULT 0 NOT NULL,
  "is_excess" boolean DEFAULT false NOT NULL,
  "vendor" text,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "updated_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "ic_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "part_id" uuid NOT NULL REFERENCES "ic_parts"("id"),
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "movement_type" "ic_stock_movement_type" NOT NULL,
  "qty" integer NOT NULL,
  "unit_cost_cents" integer,
  "note" text,
  "created_by" uuid REFERENCES "ic_staff"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_parts_category_idx" ON "ic_parts" ("category");
CREATE INDEX IF NOT EXISTS "ic_parts_location_idx" ON "ic_parts" ("location");
CREATE INDEX IF NOT EXISTS "ic_parts_low_stock_idx" ON "ic_parts" ("qty_on_hand", "reorder_point");
CREATE INDEX IF NOT EXISTS "ic_stock_movements_part_idx" ON "ic_stock_movements" ("part_id");
CREATE INDEX IF NOT EXISTS "ic_stock_movements_job_idx" ON "ic_stock_movements" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_stock_movements_created_idx" ON "ic_stock_movements" ("created_at");

ALTER TABLE "ic_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ic_stock_movements" ENABLE ROW LEVEL SECURITY;
