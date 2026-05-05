/*
  # Rename title to series and add story column

  ## Summary
  Splits the existing `title` field into two distinct fields across the `comics`
  and `wishlist` tables:

  1. Modified Tables
     - `comics`
       - `title` column renamed to `series` (preserves all existing data)
       - New `story` column added (text, default empty string) for issue subtitles/arc names
     - `wishlist`
       - `title` column renamed to `series` (preserves all existing data)
       - New `story` column added (text, default empty string)

  2. Notes
     - No data is lost — all existing title values become series values
     - story defaults to empty string so all existing rows are valid
     - The check_comic_duplicate function is updated to use the new column name
*/

-- Rename title -> series on comics
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'title'
  ) THEN
    ALTER TABLE comics RENAME COLUMN title TO series;
  END IF;
END $$;

-- Add story column to comics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'story'
  ) THEN
    ALTER TABLE comics ADD COLUMN story text DEFAULT '' NOT NULL;
  END IF;
END $$;

-- Rename title -> series on wishlist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishlist' AND column_name = 'title'
  ) THEN
    ALTER TABLE wishlist RENAME COLUMN title TO series;
  END IF;
END $$;

-- Add story column to wishlist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wishlist' AND column_name = 'story'
  ) THEN
    ALTER TABLE wishlist ADD COLUMN story text DEFAULT '' NOT NULL;
  END IF;
END $$;

-- Update check_comic_duplicate function if it exists
CREATE OR REPLACE FUNCTION check_comic_duplicate(
  p_user_id uuid,
  p_title text,
  p_issue_number text
) RETURNS uuid AS $$
DECLARE
  v_comic_id uuid;
BEGIN
  SELECT id INTO v_comic_id
  FROM comics
  WHERE user_id = p_user_id
    AND lower(series) = lower(p_title)
    AND lower(issue_number) = lower(p_issue_number)
  LIMIT 1;

  RETURN v_comic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
