/*
  # Move QuickStack Tables to Public Schema

  ## Overview
  Moves the comics and wishlist tables from the quickstack schema to the public schema
  to ensure they are accessible via Supabase's REST API.

  ## Changes
  1. Create comics and wishlist tables in public schema (if they don't exist)
  2. Copy any existing data from quickstack schema to public schema
  3. Drop tables from quickstack schema
  4. Set up all RLS policies in public schema
  5. Create necessary indexes

  ## Security
  - Enable RLS on both tables
  - Add policies for authenticated users to manage their own data
  - Policies enforce user_id ownership checks

  ## Important Notes
  - This migration preserves any existing data
  - The quickstack schema tables will be dropped after data is copied
*/

-- Create comics table in public schema if it doesn't exist
CREATE TABLE IF NOT EXISTS public.comics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  issue_number text DEFAULT '',
  publisher text DEFAULT '',
  year integer,
  condition text DEFAULT '',
  notes text DEFAULT '',
  color_image_url text,
  bw_image_url text,
  copy_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create wishlist table in public schema if it doesn't exist
CREATE TABLE IF NOT EXISTS public.wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  issue_number text DEFAULT '',
  publisher text DEFAULT '',
  priority text DEFAULT 'Medium',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Copy data from quickstack schema to public schema if quickstack tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'quickstack' AND table_name = 'comics') THEN
    INSERT INTO public.comics (id, user_id, title, issue_number, publisher, year, condition, notes, color_image_url, bw_image_url, copy_count, created_at, updated_at)
    SELECT id, user_id, title, issue_number, publisher, year, condition, notes, color_image_url, bw_image_url, copy_count, created_at, updated_at
    FROM quickstack.comics
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'quickstack' AND table_name = 'wishlist') THEN
    INSERT INTO public.wishlist (id, user_id, title, issue_number, publisher, priority, notes, created_at)
    SELECT id, user_id, title, issue_number, publisher, priority, notes, created_at
    FROM quickstack.wishlist
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Drop quickstack schema tables
DROP TABLE IF EXISTS quickstack.wishlist CASCADE;
DROP TABLE IF EXISTS quickstack.comics CASCADE;

-- Enable Row Level Security
ALTER TABLE public.comics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own comics" ON public.comics;
DROP POLICY IF EXISTS "Users can insert own comics" ON public.comics;
DROP POLICY IF EXISTS "Users can update own comics" ON public.comics;
DROP POLICY IF EXISTS "Users can delete own comics" ON public.comics;
DROP POLICY IF EXISTS "Users can view own wishlist" ON public.wishlist;
DROP POLICY IF EXISTS "Users can insert own wishlist items" ON public.wishlist;
DROP POLICY IF EXISTS "Users can update own wishlist items" ON public.wishlist;
DROP POLICY IF EXISTS "Users can delete own wishlist items" ON public.wishlist;

-- Comics policies
CREATE POLICY "Users can view own comics"
  ON public.comics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comics"
  ON public.comics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comics"
  ON public.comics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comics"
  ON public.comics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Wishlist policies
CREATE POLICY "Users can view own wishlist"
  ON public.wishlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist items"
  ON public.wishlist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wishlist items"
  ON public.wishlist FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist items"
  ON public.wishlist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance (if they don't exist)
CREATE INDEX IF NOT EXISTS comics_user_id_idx ON public.comics(user_id);
CREATE INDEX IF NOT EXISTS comics_created_at_idx ON public.comics(created_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_user_id_idx ON public.wishlist(user_id);
CREATE INDEX IF NOT EXISTS wishlist_priority_idx ON public.wishlist(priority);
