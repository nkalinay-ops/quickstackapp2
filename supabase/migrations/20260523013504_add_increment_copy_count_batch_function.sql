/*
  # Add increment_copy_count_batch function

  Creates a helper Postgres function used by the bulk upload edge function
  to increment copy_count by 1 for multiple comic IDs in a single query,
  replacing the previous approach of one UPDATE per duplicate row.

  1. New Functions
    - `increment_copy_count_batch(comic_ids uuid[])` - increments copy_count
      by 1 for all comics whose id is in the provided array.

  2. Security
    - Function is defined as SECURITY DEFINER so the edge function's service
      role can call it without needing direct UPDATE access through RLS.
    - Only the service role (used by edge functions) should call this.
*/

CREATE OR REPLACE FUNCTION increment_copy_count_batch(comic_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE comics
  SET copy_count = copy_count + 1
  WHERE id = ANY(comic_ids);
$$;
