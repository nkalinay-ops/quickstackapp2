/*
  # Fix Beta Keys RLS Policies

  ## Changes
  - Add policy to allow authenticated users to read beta keys
  - Keep write operations restricted to service role (edge functions only)
  
  ## Security
  - Authenticated users can view all beta keys (for admin dashboard)
  - Only service role can create, update, or delete beta keys
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Service role can manage beta keys" ON public.beta_keys;

-- Allow authenticated users to read beta keys
CREATE POLICY "Authenticated users can view beta keys"
  ON public.beta_keys
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert, update, delete beta keys
CREATE POLICY "Service role can insert beta keys"
  ON public.beta_keys
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update beta keys"
  ON public.beta_keys
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete beta keys"
  ON public.beta_keys
  FOR DELETE
  TO service_role
  USING (true);
