-- Fleet + installer vehicle logs. Safe to re-run.
-- Field never reads VIN, policy numbers, or document URLs from these tables
-- without going through the Field vehicle payload helper.

CREATE TABLE IF NOT EXISTS "ic_vehicles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text,
  "year" integer,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "color" text,
  "plate_last4" text,
  "vin_last6" text,
  "odometer" integer NOT NULL DEFAULT 0,
  "assigned_installer_id" uuid REFERENCES "ic_staff"("id"),
  "registration_expires_on" date,
  "insurance_expires_on" date,
  "next_oil_due_miles" integer,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ic_vehicles_assigned_idx"
  ON "ic_vehicles" ("assigned_installer_id")
  WHERE "deleted_at" IS NULL AND "active" = true;

CREATE TABLE IF NOT EXISTS "ic_vehicle_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vehicle_id" uuid NOT NULL REFERENCES "ic_vehicles"("id"),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "kind" text NOT NULL,
  "logged_at" timestamptz NOT NULL DEFAULT now(),
  "odometer" integer,
  "gallons" numeric,
  "amount_cents" integer,
  "clean_ok" boolean,
  "note" text,
  "photo_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ic_vehicle_logs_vehicle_idx"
  ON "ic_vehicle_logs" ("vehicle_id", "logged_at" DESC);

CREATE INDEX IF NOT EXISTS "ic_vehicle_logs_installer_idx"
  ON "ic_vehicle_logs" ("installer_id", "logged_at" DESC);

CREATE TABLE IF NOT EXISTS "ic_job_miles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "ic_jobs"("id"),
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "vehicle_id" uuid REFERENCES "ic_vehicles"("id"),
  "drive_date" date NOT NULL,
  "miles_out" integer NOT NULL DEFAULT 0,
  "miles_back" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ic_job_miles_job_installer_day"
  ON "ic_job_miles" ("job_id", "installer_id", "drive_date");

CREATE TABLE IF NOT EXISTS "ic_vehicle_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vehicle_id" uuid REFERENCES "ic_vehicles"("id"),
  "staff_id" uuid REFERENCES "ic_staff"("id"),
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "expires_on" date,
  "storage_path" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
