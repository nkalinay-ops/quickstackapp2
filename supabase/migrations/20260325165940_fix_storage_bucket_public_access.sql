/*
  # Fix Storage Bucket Public Access

  1. Changes
    - Update comic-covers bucket to be public so images can be displayed
    - This allows users to view their comic cover images in the app

  2. Security
    - RLS policies still restrict uploads and deletes to owner only
    - Images are publicly readable once uploaded (necessary for display)
*/

-- Update bucket to be public
UPDATE storage.buckets
SET public = true
WHERE id = 'comic-covers';
