/*
  # Update check_comic_duplicate to include story field

  ## Changes
  - Adds `p_story text` parameter to `check_comic_duplicate`
  - WHERE clause now matches on series + issue_number + story (all case-insensitive)
  - Empty story values match empty story values, preserving existing behavior for story-less entries
*/

CREATE OR REPLACE FUNCTION check_comic_duplicate(
  p_user_id uuid,
  p_title text,
  p_issue_number text,
  p_story text DEFAULT ''
) RETURNS uuid AS $$
DECLARE
  v_comic_id uuid;
BEGIN
  SELECT id INTO v_comic_id
  FROM comics
  WHERE user_id = p_user_id
    AND lower(series) = lower(p_title)
    AND lower(issue_number) = lower(p_issue_number)
    AND lower(coalesce(story, '')) = lower(coalesce(p_story, ''))
  LIMIT 1;
  RETURN v_comic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
