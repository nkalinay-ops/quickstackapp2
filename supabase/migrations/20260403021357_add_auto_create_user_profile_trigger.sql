/*
  # Add Auto-Create User Profile Trigger

  1. Changes
    - Creates a function to automatically create a user_profile when a new auth.users record is created
    - Adds a trigger on auth.users INSERT to call this function
  
  2. Purpose
    - Ensures every new user gets a user_profile record automatically
    - Prevents edge function failures when trying to update non-existent profiles
    
  3. Security
    - Function runs with security definer privileges to write to user_profiles
    - No RLS changes needed as this is a system-level operation
*/

-- Function to auto-create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, is_beta_user, created_at, updated_at)
  VALUES (NEW.id, false, now(), now());
  RETURN NEW;
END;
$$;

-- Trigger on auth.users to create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();