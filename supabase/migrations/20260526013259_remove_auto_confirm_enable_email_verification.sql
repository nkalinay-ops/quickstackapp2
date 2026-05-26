/*
  # Remove Auto Email Confirmation — Enable Native Email Verification

  ## Summary
  Re-enables Supabase's built-in email confirmation requirement for new sign-ups
  by dropping the trigger and function that were auto-confirming emails on user
  creation. This was previously disabled because sign-up was gated by beta keys.
  Now that beta key gating is removed, email verification is the access control.

  ## Changes
  1. Drop the `on_auth_user_created_confirm_email` trigger from auth.users
  2. Drop the `auto_confirm_user_email` function from the public schema

  ## Effect
  - New users who register will receive a confirmation email from Supabase
  - They must click the link before they can sign in
  - Existing confirmed users are unaffected (their email_confirmed_at is already set)

  ## Notes
  - The Supabase project's Auth email confirmation setting must be enabled in the
    Supabase Dashboard under Authentication > Settings > "Enable email confirmations"
  - The confirmation redirect URL should be set to /?page=email-confirmed so users
    land on the confirmation success page after clicking the link
*/

-- Drop the trigger that was auto-confirming emails on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_confirm_email ON auth.users;

-- Drop the function that performed the auto-confirmation
DROP FUNCTION IF EXISTS public.auto_confirm_user_email();
