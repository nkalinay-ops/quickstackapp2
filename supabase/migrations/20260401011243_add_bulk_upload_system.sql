/*
  # Add Bulk Upload System

  1. New Tables
    - `bulk_upload_jobs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `filename` (text)
      - `total_rows` (integer)
      - `processed_rows` (integer, default 0)
      - `successful_rows` (integer, default 0)
      - `failed_rows` (integer, default 0)
      - `duplicate_count` (integer, default 0)
      - `status` (text) - pending, validating, processing, completed, failed
      - `validation_errors` (jsonb, nullable)
      - `started_at` (timestamptz, nullable)
      - `completed_at` (timestamptz, nullable)
      - `created_at` (timestamptz, default now())
    
    - `bulk_upload_errors`
      - `id` (uuid, primary key)
      - `job_id` (uuid, foreign key to bulk_upload_jobs)
      - `row_number` (integer)
      - `error_type` (text)
      - `error_message` (text)
      - `row_data` (jsonb)
      - `created_at` (timestamptz, default now())

  2. Schema Changes
    - Add `can_bulk_upload` (boolean, default false) to user_profiles
    - Add `bulk_upload_granted_at` (timestamptz, nullable) to user_profiles
    - Add `bulk_upload_granted_by` (uuid, nullable, foreign key to auth.users) to user_profiles

  3. Indexes
    - Index on bulk_upload_jobs(user_id, status)
    - Index on bulk_upload_errors(job_id)

  4. Security
    - Enable RLS on both new tables
    - Add policies for authenticated users to view their own data
    - Add policies for admins to view all data
    - Block access if user is terminated

  5. Functions
    - `has_bulk_upload_permission(user_uuid uuid)` - checks if user can bulk upload
    - `check_comic_duplicate(p_user_id uuid, p_title text, p_issue_number text)` - finds duplicate comic
*/

-- Create bulk_upload_jobs table
CREATE TABLE IF NOT EXISTS bulk_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  successful_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'failed')),
  validation_errors jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create bulk_upload_errors table
CREATE TABLE IF NOT EXISTS bulk_upload_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES bulk_upload_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  error_type text NOT NULL,
  error_message text NOT NULL,
  row_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add bulk upload permission columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'can_bulk_upload'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN can_bulk_upload boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bulk_upload_granted_at'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bulk_upload_granted_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'bulk_upload_granted_by'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN bulk_upload_granted_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bulk_upload_jobs_user_status ON bulk_upload_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_errors_job_id ON bulk_upload_errors(job_id);

-- Enable RLS
ALTER TABLE bulk_upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_upload_errors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bulk_upload_jobs
CREATE POLICY "Users can view own bulk upload jobs"
  ON bulk_upload_jobs FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own bulk upload jobs"
  ON bulk_upload_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own bulk upload jobs"
  ON bulk_upload_jobs FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all bulk upload jobs"
  ON bulk_upload_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- RLS Policies for bulk_upload_errors
CREATE POLICY "Users can view own bulk upload errors"
  ON bulk_upload_errors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bulk_upload_jobs
      WHERE bulk_upload_jobs.id = bulk_upload_errors.job_id
      AND bulk_upload_jobs.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own bulk upload errors"
  ON bulk_upload_errors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bulk_upload_jobs
      WHERE bulk_upload_jobs.id = bulk_upload_errors.job_id
      AND bulk_upload_jobs.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all bulk upload errors"
  ON bulk_upload_errors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Function to check bulk upload permission
CREATE OR REPLACE FUNCTION has_bulk_upload_permission(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_uuid
    AND can_bulk_upload = true
    AND NOT EXISTS (
      SELECT 1 FROM user_terminations
      WHERE user_terminations.user_id = user_uuid
    )
  );
END;
$$;

-- Function to check for duplicate comic
CREATE OR REPLACE FUNCTION check_comic_duplicate(
  p_user_id uuid,
  p_title text,
  p_issue_number text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comic_id uuid;
BEGIN
  -- Return null if title or issue_number is empty
  IF p_title IS NULL OR trim(p_title) = '' OR p_issue_number IS NULL OR trim(p_issue_number) = '' THEN
    RETURN NULL;
  END IF;

  -- Check for existing comic with matching title and issue number
  SELECT id INTO v_comic_id
  FROM comics
  WHERE user_id = p_user_id
    AND LOWER(trim(title)) = LOWER(trim(p_title))
    AND LOWER(trim(issue_number)) = LOWER(trim(p_issue_number))
  LIMIT 1;

  RETURN v_comic_id;
END;
$$;