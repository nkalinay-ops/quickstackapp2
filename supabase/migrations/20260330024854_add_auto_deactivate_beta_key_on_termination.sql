/*
  # Auto-deactivate beta keys when user is terminated

  1. Changes
    - Creates a trigger function that automatically sets `is_active = false` on beta keys
      when a user is added to the `user_terminations` table
    - The trigger fires after a user termination is inserted
    - This ensures terminated users' beta keys are immediately deactivated
    
  2. Security
    - Function runs with security definer privileges to bypass RLS
    - Only affects beta keys belonging to the terminated user
*/

-- Create function to deactivate beta key when user is terminated
CREATE OR REPLACE FUNCTION deactivate_beta_key_on_termination()
RETURNS TRIGGER AS $$
BEGIN
  -- Set is_active to false for any beta key redeemed by the terminated user
  UPDATE beta_keys
  SET is_active = false
  WHERE redeemed_by = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run after user termination is inserted
DROP TRIGGER IF EXISTS trigger_deactivate_beta_key_on_termination ON user_terminations;

CREATE TRIGGER trigger_deactivate_beta_key_on_termination
  AFTER INSERT ON user_terminations
  FOR EACH ROW
  EXECUTE FUNCTION deactivate_beta_key_on_termination();