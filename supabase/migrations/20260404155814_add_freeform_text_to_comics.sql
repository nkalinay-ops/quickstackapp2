/*
  # Add Free-form Text Field to Comics Table

  ## Overview
  Adds a new free-form text field to the comics table for additional flexible content.

  ## Changes
  
  ### Modified Tables
  - `comics` table:
    - Adds `freeform_text` (text) - A free-form text field for any additional information, notes, or custom data the user wants to store

  ## Security
  - No RLS changes needed - existing policies cover all columns including new ones
  - The new field inherits the same security policies as other comic fields

  ## Notes
  - Field allows NULL values for backwards compatibility with existing records
  - Field has a default value of empty string for new records
  - This is being applied to QA environment first for testing and validation
*/

-- Add freeform_text column to comics table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'freeform_text'
  ) THEN
    ALTER TABLE comics ADD COLUMN freeform_text text DEFAULT '';
  END IF;
END $$;
