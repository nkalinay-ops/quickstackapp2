-- Block direct user writes to scan-count and tier columns on user_profiles.
--
-- The "Users can update own profile" RLS policy is intentionally broad so users
-- can update fields like display_name. However, it also allows users to directly
-- write monthly_scan_count = 0 (resetting their own limit), change user_tier, or
-- alter scan_month_reset_at — all of which would bypass the scan limit enforcement
-- in the scan-comic edge function.
--
-- SECURITY DEFINER functions (increment_scan_count, etc.) run as the 'postgres'
-- superuser role, so current_user = 'postgres' inside those calls. Direct user
-- API calls run as current_user = 'authenticated'. The trigger uses this to
-- distinguish legitimate server-side writes from client-side tampering.
CREATE OR REPLACE FUNCTION block_scan_count_user_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow writes from the service role / postgres (used by SECURITY DEFINER functions)
  IF current_user = 'postgres' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block any attempt by an authenticated user to change protected columns
  IF NEW.monthly_scan_count IS DISTINCT FROM OLD.monthly_scan_count THEN
    RAISE EXCEPTION 'monthly_scan_count cannot be modified directly';
  END IF;

  IF NEW.scan_month_reset_at IS DISTINCT FROM OLD.scan_month_reset_at THEN
    RAISE EXCEPTION 'scan_month_reset_at cannot be modified directly';
  END IF;

  IF NEW.user_tier IS DISTINCT FROM OLD.user_tier THEN
    RAISE EXCEPTION 'user_tier cannot be modified directly';
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin cannot be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_scan_count_columns ON user_profiles;
CREATE TRIGGER protect_scan_count_columns
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION block_scan_count_user_writes();
