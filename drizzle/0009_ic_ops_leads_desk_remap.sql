-- Inspired Closets OS — Des lead desk (PART 2 of 2).
-- Run AFTER 0008_ic_ops_leads_desk.sql has succeeded (new enum values committed).

-- Map legacy stages / sources → Community-aligned
UPDATE "ic_leads" SET "stage" = 'attempt_1' WHERE "stage" = 'follow_up';
UPDATE "ic_leads" SET "stage" = 'appointment_set' WHERE "stage" = 'schedule';
UPDATE "ic_leads" SET "source" = 'referral_personal' WHERE "source" = 'referral';
UPDATE "ic_leads" SET "source" = 'facebook' WHERE "source" = 'meta';
