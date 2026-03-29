/*
  # Block Terminated Users from Accessing Data
  
  1. Changes
    - Add restrictive RLS policies to comics and wishlist tables
    - Terminated users (those with records in user_terminations) cannot access any data
    - This prevents terminated users from reading, inserting, updating, or deleting any data
    
  2. Security
    - Creates restrictive policies that apply to all operations
    - Checks if user exists in user_terminations table
    - If user is terminated, all operations are denied
*/

CREATE POLICY "Terminated users cannot access comics"
  ON comics
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Terminated users cannot access wishlist"
  ON wishlist
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );