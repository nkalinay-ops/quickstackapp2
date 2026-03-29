/*
  # Separate Database Schemas for Different Apps

  ## Overview
  This migration creates logical separation between two different applications
  sharing the same Supabase project by using PostgreSQL schemas.

  ## Changes

  ### 1. New Schema: `landing_page`
  - Created for the early access signup application
  - Contains the `early_access_signups` table

  ### 2. Schema Organization
  - `public` schema: Comic tracker app (comics, wishlist tables)
  - `landing_page` schema: Early access signup app

  ### 3. Data Migration
  - Move `early_access_signups` table from `public` to `landing_page` schema
  - Preserve all existing data and RLS policies
  - Maintain all indexes and constraints

  ## Security
  - All existing RLS policies are preserved
  - Schema-level isolation provides additional security boundary
  - Each app operates in its own namespace

  ## Notes
  - This is a non-destructive migration
  - All data is preserved during the move
  - Applications will need to update their queries to reference the new schema
*/

-- Create the landing_page schema
CREATE SCHEMA IF NOT EXISTS landing_page;

-- Move early_access_signups table to landing_page schema
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'early_access_signups'
  ) THEN
    ALTER TABLE public.early_access_signups SET SCHEMA landing_page;
  END IF;
END $$;

-- Recreate the table if it doesn't exist in either schema
CREATE TABLE IF NOT EXISTS landing_page.early_access_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text DEFAULT '',
  signup_type text DEFAULT 'early_access' CHECK (signup_type IN ('early_access', 'beta')),
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  submission_count integer DEFAULT 1
);

-- Enable RLS on the table
ALTER TABLE landing_page.early_access_signups ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies for the landing_page schema
DROP POLICY IF EXISTS "Anyone can insert signups" ON landing_page.early_access_signups;
DROP POLICY IF EXISTS "Public read access for signups" ON landing_page.early_access_signups;

CREATE POLICY "Anyone can insert signups"
  ON landing_page.early_access_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Public read access for signups"
  ON landing_page.early_access_signups
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Create indexes for the landing_page schema
CREATE INDEX IF NOT EXISTS early_access_signups_email_idx 
  ON landing_page.early_access_signups(email);
CREATE INDEX IF NOT EXISTS early_access_signups_created_at_idx 
  ON landing_page.early_access_signups(created_at DESC);

-- Add helpful comment
COMMENT ON SCHEMA landing_page IS 'Schema for early access signup landing page application';
COMMENT ON SCHEMA public IS 'Schema for comic book tracker application (comics, wishlist)';
