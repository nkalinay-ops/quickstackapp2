-- pull_list_items: normalized upcoming release data from Lunar and PRH
CREATE TABLE IF NOT EXISTS pull_list_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('lunar', 'prh')),
  sku               text NOT NULL,
  title             text NOT NULL,
  publisher         text,
  format            text,
  variant_label     text,
  price             numeric(6,2),
  foc_date          date,
  on_sale_date      date,
  writer            text,
  artist            text,
  upc_isbn          text,
  cover_image_url   text,
  raw               jsonb,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pull_list_items_source_sku_key UNIQUE (source, sku)
);

ALTER TABLE pull_list_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read; only service role writes (via sync edge function)
CREATE POLICY "Authenticated users can read pull list items"
  ON pull_list_items FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS pull_list_items_foc_date_idx ON pull_list_items (foc_date);
CREATE INDEX IF NOT EXISTS pull_list_items_source_idx ON pull_list_items (source);

-- pull_list_sync_log: one row per sync attempt (primary, retry, or manual)
CREATE TABLE IF NOT EXISTS pull_list_sync_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  trigger             text NOT NULL CHECK (trigger IN ('primary', 'retry', 'manual')),
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'error', 'skipped')),
  lunar_rows_seen     int,
  lunar_rows_upserted int,
  lunar_error         text,
  prh_rows_seen       int,
  prh_rows_upserted   int,
  prh_error           text,
  duration_ms         int
);

ALTER TABLE pull_list_sync_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read the log (admin UI displays it)
CREATE POLICY "Authenticated users can read sync log"
  ON pull_list_sync_log FOR SELECT
  TO authenticated
  USING (true);
