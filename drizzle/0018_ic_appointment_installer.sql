ALTER TABLE "ic_appointments" ADD COLUMN IF NOT EXISTS "installer_id" uuid REFERENCES "ic_staff"("id");
