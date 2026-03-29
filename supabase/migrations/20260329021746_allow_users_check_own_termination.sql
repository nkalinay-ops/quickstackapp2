/*
  # Allow Users to Check Their Own Termination Status
  
  1. Changes
    - Add RLS policy allowing users to view their own termination record
    - This is necessary for the frontend to check if a user is terminated during login
    
  2. Security
    - Users can only see their own termination record
    - Users cannot see other users' termination records
*/

CREATE POLICY "Users can view their own termination status"
  ON user_terminations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
