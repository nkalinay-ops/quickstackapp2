/*
  # Auto-grant Admin to Specific Email

  1. Changes
    - Create a function that automatically grants admin status to nkalinay@gmail.com when they sign up
    - Create a trigger that runs this function when a new user_profile is created
    
  2. Security
    - Only affects the specified email address
    - Grants admin privileges immediately upon profile creation
*/

-- Function to auto-grant admin status to specific email
CREATE OR REPLACE FUNCTION auto_grant_admin_to_founder()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the user's email matches the founder email
  IF EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = NEW.id 
    AND email = 'nkalinay@gmail.com'
  ) THEN
    NEW.is_admin := true;
    NEW.admin_granted_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-grant admin on profile creation
DROP TRIGGER IF EXISTS auto_grant_admin_trigger ON user_profiles;
CREATE TRIGGER auto_grant_admin_trigger
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_admin_to_founder();