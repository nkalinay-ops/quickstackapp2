/*
  # Disable Email Confirmation Requirement

  1. Changes
    - Creates a trigger to auto-confirm email addresses when users sign up
    - Updates the edge function flow to work without email confirmation
  
  2. Purpose
    - Allows users to sign up and immediately access their accounts
    - Removes friction from the beta signup process
    
  3. Security
    - Still maintains beta key validation
    - Users can only sign up with valid beta keys
*/

-- Function to auto-confirm user emails
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auto-confirm the email
  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE id = NEW.id
  AND email_confirmed_at IS NULL;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-confirm emails on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_confirm_email ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm_email
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user_email();