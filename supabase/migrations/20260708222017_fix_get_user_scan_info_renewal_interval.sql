-- Restore get_user_scan_info to respect the configurable scan_renewal_interval
-- and return it in the response so the client can display the correct reset period.
--
-- The 20260628 migration overwrote this function with a simplified version that
-- used a hardcoded 'month' boundary instead of reading app_settings, and dropped
-- the renewal_interval field from the response.
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

  IF v_trunc_reset < v_trunc_now THEN
    v_effective_count := 0;
  ELSE
    v_effective_count := v_count;
  END IF;

  RETURN json_build_object(
    'tier',               v_tier,
    'monthly_scan_count', v_effective_count,
    'scan_limit',         CASE
                            WHEN v_tier = 'free' THEN 20
                            WHEN v_tier = 'paid' THEN 500
                            ELSE NULL
                          END,
    'renewal_interval',   v_interval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_scan_info(uuid) TO authenticated;
