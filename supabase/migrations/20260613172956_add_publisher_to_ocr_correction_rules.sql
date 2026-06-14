-- Add publisher columns to ocr_correction_rules and widen the unique constraint

ALTER TABLE ocr_correction_rules
  ADD COLUMN IF NOT EXISTS ocr_publisher text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS corrected_publisher text NOT NULL DEFAULT '';

-- Replace the unique constraint to include ocr_publisher
ALTER TABLE ocr_correction_rules
  DROP CONSTRAINT IF EXISTS ocr_correction_rules_unique_mapping;

ALTER TABLE ocr_correction_rules
  ADD CONSTRAINT ocr_correction_rules_unique_mapping
    UNIQUE (user_id, ocr_series, ocr_story, ocr_publisher);
