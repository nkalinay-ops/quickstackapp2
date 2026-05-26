/*
  # Gate user_profiles creation on email confirmation

  ## Summary
  Previously, a profile row was created in `user_profiles` the instant `signUp()` was
  called — before the user had confirmed their email. This meant unconfirmed users
  had valid profiles and could potentially interact with the system.

  This migration replaces that trigger with one that only fires once the user's email
  is confirmed. It also handles users who signed up before this migration ran (their
  `email_confirmed_at` is already set, so their profiles already exist — no action
  needed for them).

  ## Changes

  ### Trigger replacement
  - **Drops** the old `on_auth_user_created` trigger (fires on INSERT, unconditional)
  - **Replaces** `handle_new_user()` with a version that checks both INSERT and UPDATE:
    - On INSERT: only creates the profile if `email_confirmed_at` is already set
      (covers projects where auto-confirm is enabled)
    - On UPDATE: creates the profile when `email_confirmed_at` transitions from NULL
      to a real timestamp (the normal email-confirmation flow)
  - **Adds** a new `on_auth_user_email_confirmed` trigger that fires on UPDATE so it
    catches the confirmation event

  ## Security
  - No RLS changes; the function already runs as SECURITY DEFINER
  - INSERT on user_profiles is not exposed to end users

  ## Important notes
  1. Existing confirmed users are unaffected — their profiles already exist and the
     INSERT ... ON CONFLICT DO NOTHING clause prevents duplicates.
  2. Users who signed up but never confirmed will not have profiles created until
     they complete confirmation.
*/

-- Replace the trigger function to handle both INSERT (auto-confirm path) and
-- UPDATE (email-confirmation path).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create a profile once the email is confirmed.
  -- On INSERT this covers the auto-confirm case.
  -- On UPDATE this covers the normal email-confirmation flow (NULL -> timestamp).
  IF NEW.email_confirmed_at IS NOT NULL THEN
    -- Use ON CONFLICT DO NOTHING so re-runs and existing users are safe.
    INSERT INTO public.user_profiles (id, is_beta_user, created_at, updated_at)
    VALUES (NEW.id, false, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop the old INSERT-only trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate INSERT trigger (handles auto-confirm projects / future config changes)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add UPDATE trigger that fires when email_confirmed_at is set for the first time
DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();
