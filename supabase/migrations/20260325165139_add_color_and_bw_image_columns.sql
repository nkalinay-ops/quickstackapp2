/*
  # Add Color and Black/White Image Support

  1. Changes
    - Rename `cover_image_url` to `color_image_url` for clarity
    - Add `bw_image_url` column to store black and white version for OCR only
    - The color version will be displayed to users
    - The B&W version will only be used internally for OCR processing

  2. Notes
    - Existing `cover_image_url` data will be preserved as `color_image_url`
    - B&W images will be stored in the same storage bucket
*/

-- Rename cover_image_url to color_image_url
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'cover_image_url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'color_image_url'
  ) THEN
    ALTER TABLE comics RENAME COLUMN cover_image_url TO color_image_url;
  END IF;
END $$;

-- Add color_image_url if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'color_image_url'
  ) THEN
    ALTER TABLE comics ADD COLUMN color_image_url text;
  END IF;
END $$;

-- Add bw_image_url column for OCR processing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'bw_image_url'
  ) THEN
    ALTER TABLE comics ADD COLUMN bw_image_url text;
  END IF;
END $$;
