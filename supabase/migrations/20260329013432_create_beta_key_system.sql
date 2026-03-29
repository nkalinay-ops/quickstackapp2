/*
  # Create Beta Key System

  ## Overview
  Creates a comprehensive beta key system to control access to the application during beta testing.

  ## New Tables
  
  ### `beta_keys`
  - `id` (uuid, primary key) - Unique identifier for the beta key
  - `key_code` (text, unique) - The actual beta key string (e.g., "BETA-XXXX-XXXX-XXXX")
  - `created_at` (timestamptz) - When the key was generated
  - `expires_at` (timestamptz) - When the key expires (30 days from creation)
  - `redeemed_at` (timestamptz, nullable) - When the key was redeemed (null if not redeemed)
  - `redeemed_by` (uuid, nullable) - User ID who redeemed the key
  - `is_active` (boolean) - Whether the key is active (can be manually disabled)
  - `created_by` (text, nullable) - Optional field to track who generated the key
  - `notes` (text, nullable) - Optional notes about the key

  ### `user_profiles`
  - `id` (uuid, primary key) - References auth.users.id
  - `is_beta_user` (boolean) - Whether user is a beta tester
  - `beta_key_redeemed` (text, nullable) - Which beta key they used
  - `created_at` (timestamptz) - When profile was created
  - `updated_at` (timestamptz) - When profile was last updated

  ## Security
  - Enable RLS on both tables
  - Beta keys table: Only accessible via edge functions (no direct public access)
  - User profiles: Users can read their own profile, edge functions can update
  
  ## Indexes
  - Index on beta_keys.key_code for fast lookups
  - Index on beta_keys.is_active and expires_at for validation queries
  - Index on user_profiles.id for fast user lookups
*/

-- Create beta_keys table
CREATE TABLE IF NOT EXISTS public.beta_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by text,
  notes text
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_beta_user boolean DEFAULT false NOT NULL,
  beta_key_redeemed text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.beta_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role can manage beta keys" ON public.beta_keys;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.user_profiles;

-- Beta keys policies - Only accessible via service role (edge functions)
CREATE POLICY "Service role can manage beta keys"
  ON public.beta_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- User profiles policies
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Service role can manage profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS beta_keys_key_code_idx ON public.beta_keys(key_code);
CREATE INDEX IF NOT EXISTS beta_keys_active_expires_idx ON public.beta_keys(is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS user_profiles_beta_user_idx ON public.user_profiles(is_beta_user);

-- Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, is_beta_user, created_at, updated_at)
  VALUES (NEW.id, false, now(), now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
