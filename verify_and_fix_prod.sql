-- MANUAL PROD VERIFICATION AND FIX SCRIPT
-- Run this directly against PROD database: ucmyiukzkeybuslvfhqx
-- URL: https://ucmyiukzkeybuslvfhqx.supabase.co

-- Step 1: Check current schema
SELECT
  'CURRENT SCHEMA CHECK' as step,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'comics'
ORDER BY ordinal_position;

-- Step 2: Add freeform_text column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comics'
      AND column_name = 'freeform_text'
  ) THEN
    ALTER TABLE comics ADD COLUMN freeform_text text DEFAULT '';
    RAISE NOTICE 'Added freeform_text column to comics table';
  ELSE
    RAISE NOTICE 'freeform_text column already exists';
  END IF;
END $$;

-- Step 3: Verify the column was added
SELECT
  'VERIFICATION' as step,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'comics'
  AND column_name = 'freeform_text';

-- Step 4: Insert a test record to verify it works
INSERT INTO comics (user_id, title, issue_number, publisher, freeform_text)
VALUES (
  'cd66f899-f0d0-4b0d-891b-924c8d51fa3e',
  'MANUAL_PROD_VERIFICATION_' || to_char(now(), 'YYYY-MM-DD_HH24:MI:SS'),
  'TEST-001',
  'Manual Verification',
  'This record was manually inserted to verify freeform_text column exists in PROD database ucmyiukzkeybuslvfhqx'
)
RETURNING id, title, freeform_text, created_at;

-- Step 5: Query back the test record
SELECT
  'FINAL VERIFICATION' as step,
  id,
  title,
  freeform_text,
  created_at
FROM comics
WHERE title LIKE 'MANUAL_PROD_VERIFICATION_%'
ORDER BY created_at DESC
LIMIT 1;
