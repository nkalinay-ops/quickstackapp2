/*
  # Add cover_variant field to comics and wishlist

  ## Summary
  Adds an optional numeric `cover_variant` column to both the `comics` and `wishlist`
  tables to allow users to record which cover variant they own or are seeking.

  ## New Columns

  ### comics table
  - `cover_variant` (integer, nullable) — the cover variant number (e.g., 1, 2, 3)

  ### wishlist table
  - `cover_variant` (integer, nullable) — the cover variant number

  ## Notes
  - Purely additive, no existing rows are affected
  - No RLS changes needed; existing policies cover new columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'cover_variant'
  ) THEN
    ALTER TABLE comics ADD COLUMN cover_variant integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishlist' AND column_name = 'cover_variant'
  ) THEN
    ALTER TABLE wishlist ADD COLUMN cover_variant integer;
  END IF;
END $$;
