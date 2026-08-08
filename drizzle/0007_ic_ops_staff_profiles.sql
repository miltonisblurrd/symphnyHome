-- Inspired Closets OS — installer / driver profiles for Field app.
-- Safe after prior ic_staff migrations.

ALTER TABLE "ic_staff"
  ADD COLUMN IF NOT EXISTS "avatar_url" text,
  ADD COLUMN IF NOT EXISTS "hired_at" date,
  ADD COLUMN IF NOT EXISTS "title" text;

-- Backfill tenure start from account creation when unknown.
UPDATE "ic_staff"
SET "hired_at" = ("created_at" AT TIME ZONE 'UTC')::date
WHERE "hired_at" IS NULL AND "created_at" IS NOT NULL;

UPDATE "ic_staff"
SET "title" = 'Installer'
WHERE "role" = 'installer' AND ("title" IS NULL OR "title" = '');

INSERT INTO storage.buckets (id, name, public)
VALUES ('ic-staff-avatars', 'ic-staff-avatars', true)
ON CONFLICT (id) DO NOTHING;
