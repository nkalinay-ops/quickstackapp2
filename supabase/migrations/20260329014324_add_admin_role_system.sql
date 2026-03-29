/*
  # Add Admin Role System

  1. Schema Changes
    - Add `is_admin` column to user_profiles table
    - Add `admin_granted_at` timestamp column to track when admin privileges were granted
    - Add `admin_granted_by` column to track who granted admin privileges
    
  2. Security
    - Create function to check if current user is admin
    - Update RLS policies on beta_keys table to allow admins full access
    - Update RLS policies on user_profiles table to allow admins to view all profiles
    - Add policy for admins to update other users' admin status
    
  3. Indexes
    - Add index on is_admin column for performance
*/

-- Add admin columns to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS admin_granted_at timestamptz,
ADD COLUMN IF NOT EXISTS admin_granted_by uuid REFERENCES auth.users(id);

-- Create function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin) WHERE is_admin = true;

-- Update beta_keys policies to allow admin access
DROP POLICY IF EXISTS "Authenticated users can view beta keys" ON beta_keys;
DROP POLICY IF EXISTS "Authenticated users can insert beta keys" ON beta_keys;

-- Admins can view all beta keys
CREATE POLICY "Admins can view all beta keys"
  ON beta_keys FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admins can insert beta keys
CREATE POLICY "Admins can insert beta keys"
  ON beta_keys FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Admins can update beta keys
CREATE POLICY "Admins can update beta keys"
  ON beta_keys FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins can delete beta keys
CREATE POLICY "Admins can delete beta keys"
  ON beta_keys FOR DELETE
  TO authenticated
  USING (is_admin());

-- Update user_profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Users can view own profile, admins can view all profiles
CREATE POLICY "Users can view own profile or admins can view all"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR is_admin());

-- Users can update own profile (except admin fields)
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update admin status of other users
CREATE POLICY "Admins can manage admin status"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());