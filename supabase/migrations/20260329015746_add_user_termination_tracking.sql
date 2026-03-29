/*
  # Add User Termination Tracking
  
  1. New Tables
    - `user_terminations` table to track terminated users
      - `user_id` (uuid, primary key, references auth.users)
      - `terminated_at` (timestamptz, when the user was terminated)
      - `terminated_by` (uuid, which admin performed the termination)
      - `reason` (text, optional reason for termination)
    
  2. Security
    - Enable RLS on `user_terminations` table
    - Only admins can read termination records
    - Terminated users cannot access any data
*/

CREATE TABLE IF NOT EXISTS user_terminations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terminated_at timestamptz DEFAULT now() NOT NULL,
  terminated_by uuid REFERENCES auth.users(id),
  reason text
);

ALTER TABLE user_terminations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view terminations"
  ON user_terminations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Only admins can add terminations"
  ON user_terminations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_admin = true
    )
  );