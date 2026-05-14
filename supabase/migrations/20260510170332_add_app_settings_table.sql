/*
  # Add App Settings Table

  ## Summary
  Creates a key/value store for admin-configurable application settings.
  The first setting introduced is `scan_renewal_interval`, which controls
  how often free-tier scan counts reset. This is primarily used to enable
  testing the renewal logic without waiting a full calendar month.

  ## New Tables
  - `app_settings`
    - `key` (text, primary key): the setting name
    - `value` (text): the setting value
    - `updated_at` (timestamptz): when the setting was last changed
    - `updated_by` (uuid): which admin user made the last change

  ## Default Data
  - `scan_renewal_interval = 'month'`: preserves existing production behavior

  ## Security
  - RLS enabled; only users with `user_tier = 'admin'` in user_profiles can read or update rows
  - Anonymous and non-admin authenticated users have no access
*/

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read settings
CREATE POLICY "Admins can read app settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.user_tier = 'admin'
    )
  );

-- Only admins can update settings
CREATE POLICY "Admins can update app settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.user_tier = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.user_tier = 'admin'
    )
  );

-- Seed the default scan renewal interval
INSERT INTO app_settings (key, value, updated_at)
VALUES ('scan_renewal_interval', 'month', now())
ON CONFLICT (key) DO NOTHING;
