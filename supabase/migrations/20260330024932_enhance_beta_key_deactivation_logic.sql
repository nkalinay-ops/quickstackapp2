/*
  # Enhanced beta key deactivation on user termination

  1. Changes
    - Updates the trigger function to handle both scenarios:
      a) Beta keys linked via `redeemed_by` column
      b) Beta keys linked via `user_profiles.beta_key_redeemed` column
    - This ensures all beta keys are deactivated regardless of how they're linked
    
  2. Security
    - Function runs with security definer privileges to bypass RLS
    - Deactivates all beta keys associated with the terminated user
*/

-- Update function to handle both beta key linking methods
CREATE OR REPLACE FUNCTION deactivate_beta_key_on_termination()
RETURNS TRIGGER AS $$
DECLARE
  v_beta_key_code text;
BEGIN
  -- Deactivate beta key if linked via redeemed_by
  UPDATE beta_keys
  SET is_active = false
  WHERE redeemed_by = NEW.user_id;
  
  -- Also check user_profiles for beta_key_redeemed and deactivate that key
  SELECT beta_key_redeemed INTO v_beta_key_code
  FROM user_profiles
  WHERE id = NEW.user_id;
  
  IF v_beta_key_code IS NOT NULL THEN
    UPDATE beta_keys
    SET is_active = false
    WHERE key_code = v_beta_key_code;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;