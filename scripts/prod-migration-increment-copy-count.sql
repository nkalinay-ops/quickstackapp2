-- Run this in the Supabase Dashboard SQL Editor (app.supabase.com > SQL Editor)
-- Creates the increment_copy_count_batch function used by the bulk upload edge function

CREATE OR REPLACE FUNCTION increment_copy_count_batch(comic_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE comics
  SET copy_count = copy_count + 1
  WHERE id = ANY(comic_ids);
$$;
