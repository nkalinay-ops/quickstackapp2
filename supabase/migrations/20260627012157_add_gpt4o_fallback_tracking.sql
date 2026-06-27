-- Track how many scans fell back from gpt-4o-mini to gpt-4o per user
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS gpt4o_fallback_scan_count INTEGER NOT NULL DEFAULT 0;

-- Atomic increment function (mirrors increment_scan_count pattern)
CREATE OR REPLACE FUNCTION increment_gpt4o_fallback_count(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_profiles
  SET gpt4o_fallback_scan_count = gpt4o_fallback_scan_count + 1
  WHERE id = p_user_id;
$$;
