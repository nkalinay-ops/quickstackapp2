/*
  # Auto-grant bulk upload permission to admins

  1. Changes
    - Grant bulk upload permission to all existing admins retroactively
    - Create a trigger function to automatically grant bulk upload when a user becomes an admin
    - Create a trigger to execute the function on user_profiles updates

  2. Security
    - Only affects admin users
    - Maintains audit trail with granted_at and granted_by fields
    - Ensures admins always have bulk upload access
*/

-- First, retroactively grant bulk upload to all existing admins who don't have it
UPDATE user_profiles
SET 
  can_bulk_upload = true,
  bulk_upload_granted_at = COALESCE(bulk_upload_granted_at, admin_granted_at, now()),
  bulk_upload_granted_by = COALESCE(bulk_upload_granted_by, admin_granted_by)
WHERE 
  is_admin = true 
  AND can_bulk_upload = false;

-- Create a trigger function to auto-grant bulk upload when someone becomes an admin
CREATE OR REPLACE FUNCTION auto_grant_bulk_upload_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  -- If user is being promoted to admin and doesn't have bulk upload
  IF NEW.is_admin = true AND (OLD.is_admin IS NULL OR OLD.is_admin = false) THEN
    -- Auto-grant bulk upload permission
    NEW.can_bulk_upload = true;
    
    -- Set granted timestamp if not already set
    IF NEW.bulk_upload_granted_at IS NULL THEN
      NEW.bulk_upload_granted_at = COALESCE(NEW.admin_granted_at, now());
    END IF;
    
    -- Set granted_by if not already set
    IF NEW.bulk_upload_granted_by IS NULL THEN
      NEW.bulk_upload_granted_by = COALESCE(NEW.admin_granted_by, auth.uid());
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to execute the function before updates
DROP TRIGGER IF EXISTS trigger_auto_grant_bulk_upload ON user_profiles;
CREATE TRIGGER trigger_auto_grant_bulk_upload
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_grant_bulk_upload_to_admin();
