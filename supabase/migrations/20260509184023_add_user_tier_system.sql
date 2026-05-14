/*
  # Add User Tier System

  ## Summary
  Adds a three-tier user access model (free, paid, admin) to replace the
  ad-hoc boolean flags for feature gating. Introduces scan usage tracking
  with automatic monthly reset logic.

  ## New Columns on user_profiles
  - `user_tier` (text): 'free' | 'paid' | 'admin' — defaults to 'free'
  - `monthly_scan_count` (integer): number of scans used this calendar month, resets automatically
  - `scan_month_reset_at` (timestamptz): the month/year the counter belongs to; used to detect when a new month has started

  ## Data Migration
  - Existing users with `is_admin = true` are promoted to 'admin' tier
  - Existing users with `can_bulk_upload = true` (and not already admin) are promoted to 'paid' tier
  - All other existing users default to 'free' tier

  ## New Functions
  - `get_user_scan_info(p_user_id uuid)`: returns tier, monthly_scan_count, and limit for the calling user
  - `increment_scan_count(p_user_id uuid)`: increments the counter, auto-resetting it if we've crossed into a new calendar month

  ## Tier Rules (enforced in edge functions)
  - free: max 20 scans per calendar month, no bulk upload
  - paid: unlimited scans, bulk upload allowed
  - admin: unlimited scans, bulk upload allowed, all admin features
*/

-- 1. Add user_tier column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'user_tier'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN user_tier text NOT NULL DEFAULT 'free'
      CHECK (user_tier IN ('free', 'paid', 'admin'));
  END IF;
END $$;

-- 2. Add monthly scan tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'monthly_scan_count'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN monthly_scan_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'scan_month_reset_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN scan_month_reset_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- 3. Migrate existing data: admins → 'admin' tier, bulk-upload users → 'paid' tier
UPDATE user_profiles
SET user_tier = 'admin'
WHERE is_admin = true AND user_tier = 'free';

UPDATE user_profiles
SET user_tier = 'paid'
WHERE can_bulk_upload = true AND is_admin = false AND user_tier = 'free';

-- 4. Function: increment_scan_count
-- Auto-resets monthly_scan_count when the calendar month changes, then increments.
CREATE OR REPLACE FUNCTION increment_scan_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset_at timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT scan_month_reset_at INTO v_reset_at
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_reset_at IS NULL OR
     date_trunc('month', v_reset_at) < date_trunc('month', v_now) THEN
    UPDATE user_profiles
    SET monthly_scan_count = 1,
        scan_month_reset_at = v_now,
        updated_at = v_now
    WHERE id = p_user_id;
  ELSE
    UPDATE user_profiles
    SET monthly_scan_count = monthly_scan_count + 1,
        updated_at = v_now
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- 5. Function: get_user_scan_info
-- Returns tier, current monthly scan count, and the monthly limit for a user.
CREATE OR REPLACE FUNCTION get_user_scan_info(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier text;
  v_count integer;
  v_reset_at timestamptz;
  v_now timestamptz := now();
  v_effective_count integer;
BEGIN
  SELECT user_tier, monthly_scan_count, scan_month_reset_at
  INTO v_tier, v_count, v_reset_at
  FROM user_profiles
  WHERE id = p_user_id;

  -- If we're in a new month, effective count is 0
  IF v_reset_at IS NULL OR
     date_trunc('month', v_reset_at) < date_trunc('month', v_now) THEN
    v_effective_count := 0;
  ELSE
    v_effective_count := v_count;
  END IF;

  RETURN json_build_object(
    'tier', v_tier,
    'monthly_scan_count', v_effective_count,
    'scan_limit', CASE WHEN v_tier = 'free' THEN 20 ELSE NULL END
  );
END;
$$;

-- 6. RLS: allow authenticated users to read their own tier/scan info
-- The existing RLS policy on user_profiles already covers SELECT for own row.
-- We just need to grant execute on the new functions to authenticated users.
GRANT EXECUTE ON FUNCTION increment_scan_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_scan_info(uuid) TO authenticated;
