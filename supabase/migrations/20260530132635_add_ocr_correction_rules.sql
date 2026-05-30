/*
  # Add OCR Correction Rules

  ## Purpose
  Enables a per-user rule engine that learns from repeated OCR corrections and
  automatically applies confirmed corrections to future scans.

  ## New Table: ocr_correction_rules
  Tracks how many times a user has corrected a specific OCR output (series + story)
  to a specific corrected value. When occurrence_count reaches the user's configured
  threshold, the app suggests confirming it as an active rule.

  ### Columns
  - `id` — UUID primary key
  - `user_id` — FK to auth.users; rules are per-user
  - `ocr_series` — raw series text returned by the OCR engine
  - `ocr_story` — raw story text returned by the OCR engine
  - `corrected_series` — what the user saved as the series
  - `corrected_story` — what the user saved as the story
  - `occurrence_count` — number of times this exact OCR→correction mapping was observed
  - `is_confirmed` — true once the user explicitly approves the rule; only confirmed rules are auto-applied
  - `dismissed_at` — when the user dismissed the suggestion banner (so we don't re-prompt on every load)
  - `created_at`, `updated_at`

  ## New Table: user_scan_preferences
  Stores per-user configurable preferences for the scan rule engine.

  ### Columns
  - `user_id` — PK and FK to auth.users
  - `correction_threshold` — how many corrections before a rule is suggested (default 3)
  - `updated_at`

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own rows
*/

-- ocr_correction_rules table
CREATE TABLE IF NOT EXISTS ocr_correction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ocr_series text NOT NULL DEFAULT '',
  ocr_story text NOT NULL DEFAULT '',
  corrected_series text NOT NULL DEFAULT '',
  corrected_story text NOT NULL DEFAULT '',
  occurrence_count integer NOT NULL DEFAULT 1,
  is_confirmed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_correction_rules_unique_mapping UNIQUE (user_id, ocr_series, ocr_story)
);

ALTER TABLE ocr_correction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own correction rules"
  ON ocr_correction_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own correction rules"
  ON ocr_correction_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own correction rules"
  ON ocr_correction_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own correction rules"
  ON ocr_correction_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ocr_correction_rules_user_id_idx ON ocr_correction_rules(user_id);

-- user_scan_preferences table
CREATE TABLE IF NOT EXISTS user_scan_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_threshold integer NOT NULL DEFAULT 3 CHECK (correction_threshold >= 2 AND correction_threshold <= 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_scan_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own scan preferences"
  ON user_scan_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scan preferences"
  ON user_scan_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scan preferences"
  ON user_scan_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
