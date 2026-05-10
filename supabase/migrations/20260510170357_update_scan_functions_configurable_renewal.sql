/*
  # Update Scan Functions: Configurable Renewal Interval

  ## Summary
  Updates `get_user_scan_info` and `increment_scan_count` to read the
  `scan_renewal_interval` setting from `app_settings` and apply the correct
  time boundary instead of always using a fixed calendar month.

  ## Modified Functions
  - `get_user_scan_info(p_user_id uuid)`:
    Reads `scan_renewal_interval` and uses `date_trunc('month', ...)` for 'month'
    or `date_trunc('day', ...)` for 'day' when deciding if a reset has occurred.

  - `increment_scan_count(p_user_id uuid)`:
    Same interval logic on the write side so reset behavior on increment matches
    the read behavior in get_user_scan_info.

  ## Supported Interval Values
  - `month` (default): resets at the start of each calendar month (production)
  - `day`: resets at midnight each calendar day (for testing)

  ## Backward Compatibility
  If the `app_settings` row is missing or has an unrecognised value, both
  functions fall back to `month` behavior — no change from prior behavior.
*/

-- Updated increment_scan_count: respects scan_renewal_interval setting
CREATE OR REPLACE FUNCTION increment_scan_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset_at   timestamptz;
  v_now        timestamptz := now();
  v_interval   text := 'month';
  v_trunc_now  timestamptz;
  v_trunc_reset timestamptz;
BEGIN
  -- Read the configured renewal interval; fall back to 'month' if not found
  SELECT value INTO v_interval
  FROM app_settings
  WHERE key = 'scan_renewal_interval';

  IF v_interval IS NULL OR v_interval NOT IN ('month', 'day') THEN
    v_interval := 'month';
  END IF;

  v_trunc_now := date_trunc(v_interval, v_now);

  SELECT scan_month_reset_at INTO v_reset_at
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_reset_at IS NULL THEN
    v_trunc_reset := '-infinity'::timestamptz;
  ELSE
    v_trunc_reset := date_trunc(v_interval, v_reset_at);
  END IF;

  IF v_trunc_reset < v_trunc_now THEN
    -- New period: reset counter to 1
    UPDATE user_profiles
    SET monthly_scan_count = 1,
        scan_month_reset_at = v_now,
        updated_at = v_now
    WHERE id = p_user_id;
  ELSE
    -- Same period: just increment
    UPDATE user_profiles
    SET monthly_scan_count = monthly_scan_count + 1,
        updated_at = v_now
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- Updated get_user_scan_info: respects scan_renewal_interval setting
CREATE OR REPLACE FUNCTION get_user_scan_info(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier            text;
  v_count           integer;
  v_reset_at        timestamptz;
  v_now             timestamptz := now();
  v_interval        text := 'month';
  v_trunc_now       timestamptz;
  v_trunc_reset     timestamptz;
  v_effective_count integer;
BEGIN
  -- Read the configured renewal interval; fall back to 'month' if not found
  SELECT value INTO v_interval
  FROM app_settings
  WHERE key = 'scan_renewal_interval';

  IF v_interval IS NULL OR v_interval NOT IN ('month', 'day') THEN
    v_interval := 'month';
  END IF;

  v_trunc_now := date_trunc(v_interval, v_now);

  SELECT user_tier, monthly_scan_count, scan_month_reset_at
  INTO v_tier, v_count, v_reset_at
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_reset_at IS NULL THEN
    v_trunc_reset := '-infinity'::timestamptz;
  ELSE
    v_trunc_reset := date_trunc(v_interval, v_reset_at);
  END IF;

  -- If we're in a new period, effective count is 0
  IF v_trunc_reset < v_trunc_now THEN
    v_effective_count := 0;
  ELSE
    v_effective_count := v_count;
  END IF;

  RETURN json_build_object(
    'tier', v_tier,
    'monthly_scan_count', v_effective_count,
    'scan_limit', CASE WHEN v_tier = 'free' THEN 20 ELSE NULL END,
    'renewal_interval', v_interval
  );
END;
$$;

-- Re-grant execute permissions (CREATE OR REPLACE can sometimes drop them)
GRANT EXECUTE ON FUNCTION increment_scan_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_scan_info(uuid) TO authenticated;
