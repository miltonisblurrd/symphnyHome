-- Stow sales-order PDFs from inspiredclosetslv@gmail.com.
-- Check document only — does not replace product summaries or receiving slips.

CREATE TABLE IF NOT EXISTS "ic_stow_sales_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid REFERENCES "ic_jobs"("id") ON DELETE SET NULL,
  "gmail_message_id" text,
  "from_email" text,
  "subject" text,
  "so_number" text,
  "order_name" text,
  "ship_date" date,
  "item_count" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "source_filename" text,
  "storage_path" text,
  "public_url" text,
  "status" text DEFAULT 'received' NOT NULL,
  "ignore_reason" text,
  "parse_error" text,
  "parse_quality" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ic_stow_sales_orders_gmail_idx"
  ON "ic_stow_sales_orders" ("gmail_message_id")
  WHERE "gmail_message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ic_stow_sales_orders_job_idx" ON "ic_stow_sales_orders" ("job_id");
CREATE INDEX IF NOT EXISTS "ic_stow_sales_orders_so_idx" ON "ic_stow_sales_orders" ("so_number");
CREATE INDEX IF NOT EXISTS "ic_stow_sales_orders_status_idx" ON "ic_stow_sales_orders" ("status");

CREATE TABLE IF NOT EXISTS "ic_stow_sales_order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sales_order_id" uuid NOT NULL REFERENCES "ic_stow_sales_orders"("id") ON DELETE CASCADE,
  "line_no" integer,
  "item_code" text,
  "description" text,
  "qty" integer DEFAULT 1 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ic_stow_sales_order_lines_so_idx"
  ON "ic_stow_sales_order_lines" ("sales_order_id");
