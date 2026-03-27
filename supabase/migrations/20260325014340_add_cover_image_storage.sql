/*
  # Add Cover Image Storage Support

  1. Changes
    - Add `cover_image_url` column to `comics` table to store the photo URL
    - Create a storage bucket `comic-covers` for storing comic cover images
    - Set up RLS policies for the storage bucket
  
  2. Security
    - Users can upload images to their own folder (user_id based)
    - Users can read their own images
    - Users can delete their own images
*/

-- Add cover_image_url column to comics table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comics' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE comics ADD COLUMN cover_image_url text;
  END IF;
END $$;

-- Create storage bucket for comic covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('comic-covers', 'comic-covers', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for comic-covers bucket

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload own comic covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comic-covers' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own images
CREATE POLICY "Users can view own comic covers"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comic-covers' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own comic covers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'comic-covers' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
