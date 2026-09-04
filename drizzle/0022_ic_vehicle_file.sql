-- Additive truck file + installer license. Safe to re-run.
-- Does not change existing Field vehicle keys; new columns are optional.

ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "plate" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "vin" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "registered_owner" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "garage_address" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "insurance_carrier" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "insurance_policy" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "insurance_agency" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "insurance_agency_phone" text;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "insurance_effective_on" date;
ALTER TABLE "ic_vehicles" ADD COLUMN IF NOT EXISTS "declared_weight_lbs" integer;

CREATE TABLE IF NOT EXISTS "ic_staff_licenses" (
  "staff_id" uuid PRIMARY KEY REFERENCES "ic_staff"("id"),
  "legal_name" text,
  "license_number" text,
  "state" text,
  "class" text,
  "issued_on" date,
  "expires_on" date,
  "endorsements" text,
  "restrictions" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
