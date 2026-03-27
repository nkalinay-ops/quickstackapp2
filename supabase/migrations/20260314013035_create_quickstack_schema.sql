/*
  # QuickStack Comic Tracker Schema

  ## Overview
  Database schema for QuickStack - a mobile-first comic book collection tracker.
  
  ## New Tables
  
  ### `comics`
  User's comic book collection with essential tracking information.
  - `id` (uuid, primary key) - Unique identifier for each comic
  - `user_id` (uuid, foreign key) - References auth.users, owner of the comic
  - `title` (text) - Comic book title
  - `issue_number` (text) - Issue number (can be text for special issues like "Annual #1")
  - `publisher` (text) - Publisher name (Marvel, DC, Image, etc.)
  - `year` (integer) - Publication year
  - `condition` (text) - Comic condition (Mint, Near Mint, Very Fine, etc.)
  - `notes` (text, optional) - Additional notes about the comic
  - `created_at` (timestamptz) - When the record was created
  - `updated_at` (timestamptz) - When the record was last updated
  
  ### `wishlist`
  Comics the user wants to acquire.
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key) - References auth.users
  - `title` (text) - Comic book title
  - `issue_number` (text) - Issue number
  - `publisher` (text) - Publisher name
  - `priority` (text) - Priority level (High, Medium, Low)
  - `notes` (text, optional) - Notes about where to find it, price range, etc.
  - `created_at` (timestamptz) - When added to wishlist
  
  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Users can only access their own comics and wishlist items
  - Policies for SELECT, INSERT, UPDATE, and DELETE operations
  - All policies restricted to authenticated users only
  
  ## Notes
  - Comic condition uses text to allow flexibility (could be standardized later)
  - Issue numbers are text to support special issues, annuals, etc.
  - Timestamps track creation and updates for audit purposes
*/

-- Create comics table
CREATE TABLE IF NOT EXISTS comics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  issue_number text DEFAULT '',
  publisher text DEFAULT '',
  year integer,
  condition text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create wishlist table
CREATE TABLE IF NOT EXISTS wishlist (
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
ALTER TABLE comics ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

-- Comics policies
CREATE POLICY "Users can view own comics"
  ON comics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comics"
  ON comics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comics"
  ON comics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comics"
  ON comics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Wishlist policies
CREATE POLICY "Users can view own wishlist"
  ON wishlist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist items"
  ON wishlist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wishlist items"
  ON wishlist FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist items"
  ON wishlist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS comics_user_id_idx ON comics(user_id);
CREATE INDEX IF NOT EXISTS comics_created_at_idx ON comics(created_at DESC);
CREATE INDEX IF NOT EXISTS wishlist_user_id_idx ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS wishlist_priority_idx ON wishlist(priority);