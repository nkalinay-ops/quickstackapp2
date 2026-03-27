/*
  # Add Copy Count to Comics Table

  ## Overview
  Adds copy count tracking to the comics table to support duplicate detection
  and multiple copy management.

  ## Changes Made
  
  1. New Columns
    - `copy_count` (integer) - Number of copies owned, defaults to 1
  
  2. Indexes
    - Add composite index on (user_id, title, issue_number) for efficient duplicate detection
    - Uses LOWER() for case-insensitive matching
  
  ## Notes
  - Existing comics will default to copy_count = 1
  - The composite index helps quickly find potential duplicates when scanning new comics
  - Copy count must be at least 1 (enforced by check constraint)
*/

-- Add copy_count column to comics table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'copy_count'
  ) THEN
    ALTER TABLE comics ADD COLUMN copy_count integer DEFAULT 1 NOT NULL;
  END IF;
END $$;

-- Add check constraint to ensure copy_count is at least 1
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'comics_copy_count_positive'
  ) THEN
    ALTER TABLE comics ADD CONSTRAINT comics_copy_count_positive CHECK (copy_count >= 1);
  END IF;
END $$;

-- Create composite index for duplicate detection (case-insensitive)
CREATE INDEX IF NOT EXISTS comics_duplicate_detection_idx 
  ON comics(user_id, LOWER(title), LOWER(issue_number));
