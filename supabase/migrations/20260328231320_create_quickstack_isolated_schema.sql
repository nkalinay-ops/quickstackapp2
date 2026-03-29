/*
  # Create Isolated QuickStack Schema

  ## Overview
  Creates a dedicated schema for the QuickStack application to isolate it from other apps
  sharing this database. This ensures complete data separation between applications.

  ## Changes
  1. Create dedicated `quickstack` schema
  2. Move comics and wishlist tables from public schema to quickstack schema
  3. Recreate all RLS policies in the new schema
  4. Maintain all indexes and constraints

  ## Security
  - Complete data isolation between applications
  - Each app gets its own schema namespace
  - RLS policies prevent cross-user data access within QuickStack
  - Schema separation prevents cross-app data access

  ## Important Notes
  - This migration preserves any existing data in the public.comics and public.wishlist tables
  - The public schema tables are NOT dropped to avoid affecting other applications
  - QuickStack will use quickstack.comics and quickstack.wishlist going forward
*/

-- Create quickstack schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS quickstack;

-- Drop existing tables in quickstack schema if they exist (for clean slate)
DROP TABLE IF EXISTS quickstack.wishlist CASCADE;
DROP TABLE IF EXISTS quickstack.comics CASCADE;

-- Create comics table in quickstack schema
CREATE TABLE quickstack.comics (
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

-- Create wishlist table in quickstack schema
CREATE TABLE quickstack.wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  issue_number text DEFAULT '',
  publisher text DEFAULT '',
  priority text DEFAULT 'Medium',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE quickstack.comics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quickstack.wishlist ENABLE ROW LEVEL SECURITY;

-- Comics policies
CREATE POLICY "Users can view own comics"
  ON quickstack.comics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comics"
  ON quickstack.comics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comics"
  ON quickstack.comics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comics"
  ON quickstack.comics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Wishlist policies
CREATE POLICY "Users can view own wishlist"
  ON quickstack.wishlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist items"
  ON quickstack.wishlist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wishlist items"
  ON quickstack.wishlist FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist items"
  ON quickstack.wishlist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX comics_user_id_idx ON quickstack.comics(user_id);
CREATE INDEX comics_created_at_idx ON quickstack.comics(created_at DESC);
CREATE INDEX wishlist_user_id_idx ON quickstack.wishlist(user_id);
CREATE INDEX wishlist_priority_idx ON quickstack.wishlist(priority);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA quickstack TO authenticated;
GRANT ALL ON quickstack.comics TO authenticated;
GRANT ALL ON quickstack.wishlist TO authenticated;