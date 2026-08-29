-- Color / finish on warehouse parts. Item # stays on barcode and may be blank.
ALTER TABLE "ic_parts"
  ADD COLUMN IF NOT EXISTS "color" text;
