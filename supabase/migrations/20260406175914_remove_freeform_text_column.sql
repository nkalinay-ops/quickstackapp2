/*
  # Remove freeform_text column from comics table

  1. Changes
    - Remove `freeform_text` column from `comics` table

  2. Notes
    - This migration removes the unused freeform_text field
    - Data in this column will be permanently deleted
    - No RLS policy changes needed as column is being removed
*/

-- Remove the freeform_text column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'freeform_text'
  ) THEN
    ALTER TABLE comics DROP COLUMN freeform_text;
  END IF;
END $$;