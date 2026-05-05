/*
  # Add total issues tracking to comics and wishlist

  ## Summary
  Adds two new nullable columns to both the `comics` and `wishlist` tables to support
  story arc completion tracking.

  ## New Columns

  ### comics table
  - `total_issues` (integer, nullable) — the total number of issues in the story arc,
    as extracted by OCR or entered manually by the user
  - `total_issues_conflict` (boolean, nullable) — set to true when two comics in the same
    arc report different total_issues values, flagging the user to verify and correct

  ### wishlist table
  - `total_issues` (integer, nullable) — same purpose as above for wishlist entries
  - `total_issues_conflict` (boolean, nullable) — same conflict flag for wishlist entries

  ## Notes
  - Both columns are nullable with no default, so existing rows are unaffected
  - No RLS changes needed; existing policies on both tables already cover new columns
  - This migration is purely additive and safe to run alongside the pending title→series migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'total_issues'
  ) THEN
    ALTER TABLE comics ADD COLUMN total_issues integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'total_issues_conflict'
  ) THEN
    ALTER TABLE comics ADD COLUMN total_issues_conflict boolean;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishlist' AND column_name = 'total_issues'
  ) THEN
    ALTER TABLE wishlist ADD COLUMN total_issues integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishlist' AND column_name = 'total_issues_conflict'
  ) THEN
    ALTER TABLE wishlist ADD COLUMN total_issues_conflict boolean;
  END IF;
END $$;
