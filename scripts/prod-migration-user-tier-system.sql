-- =============================================================================
-- PRODUCTION MIGRATION: User Tier System
-- File: scripts/prod-migration-user-tier-system.sql
-- Date: 2026-05-09
--
-- Run this in your production Supabase project via:
--   Supabase Dashboard → SQL Editor → paste and run
--
-- WHAT THIS DOES:
--   1. Adds user_tier column ('free' | 'paid' | 'admin') to user_profiles
--   2. Adds monthly_scan_count and scan_month_reset_at columns for scan tracking
--   3. Migrates existing data:
--        - Users with is_admin = true  → 'admin' tier
--        - Users with can_bulk_upload = true (non-admin) → 'paid' tier
--        - Everyone else → 'free' tier (the default)
--   4. Creates increment_scan_count() function (called by scan-comic edge function)
--   5. Creates get_user_scan_info() function (called by scan-comic edge function
--      and the AddComic frontend to show remaining scans)
--   6. Grants execute on both functions to authenticated users
--
-- SAFE TO RE-RUN: All column additions use IF NOT EXISTS guards.
-- =============================================================================

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

-- 3. Migrate existing data
--    Admins → 'admin' tier
UPDATE user_profiles
SET user_tier = 'admin'
WHERE is_admin = true AND user_tier = 'free';

--    Users who already had bulk upload access → 'paid' tier
UPDATE user_profiles
SET user_tier = 'paid'
WHERE can_bulk_upload = true AND is_admin = false AND user_tier = 'free';

-- 4. Function: increment_scan_count
--    Called after every successful comic scan. Auto-resets the monthly counter
--    when the calendar month changes.
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
--    Returns the user's tier, effective monthly scan count (resets at month boundary),
--    and their scan limit (20 for free, null for paid/admin).
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

-- 6. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_scan_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_scan_info(uuid) TO authenticated;
