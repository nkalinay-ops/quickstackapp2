-- 1. Extend user_tier CHECK constraint to include 'plus'
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_tier_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_tier_check
  CHECK (user_tier IN ('free', 'paid', 'plus', 'admin'));

-- 2. Add subscription tracking column
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- 3. Update get_user_scan_info to return 500 limit for paid tier
--    (paid was previously unlimited — now capped at 500 scans/month)
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
    'scan_limit', CASE
      WHEN v_tier = 'free' THEN 20
      WHEN v_tier = 'paid' THEN 500
      ELSE NULL
    END
  );
END;
$$;
