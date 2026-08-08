-- Inspired Closets OS — Google Calendar prep (Phase 4 follow-on).
-- Safe after 0004.

ALTER TABLE "ic_appointments"
  ADD COLUMN IF NOT EXISTS "google_event_id" text;

CREATE INDEX IF NOT EXISTS "ic_appointments_google_event_idx"
  ON "ic_appointments" ("google_event_id");
