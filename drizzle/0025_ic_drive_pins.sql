-- GPS pins for installer drives: clock in (leave shop), install done, clock out (back at shop).
-- Miles on ic_job_miles are computed from these pins. Safe to re-run.

CREATE TABLE IF NOT EXISTS "ic_drive_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "installer_id" uuid NOT NULL REFERENCES "ic_staff"("id"),
  "job_id" uuid REFERENCES "ic_jobs"("id"),
  "kind" text NOT NULL CHECK ("kind" IN ('clock_in', 'install_done', 'clock_out')),
  "lat" text NOT NULL,
  "lng" text NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ic_drive_pins_installer_day_idx"
  ON "ic_drive_pins" ("installer_id", "recorded_at");
