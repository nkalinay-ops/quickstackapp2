-- Production migration: add purchase_price and purchase_date to comics table
-- Run this against your production database once.
-- Safe to run multiple times (uses IF NOT EXISTS).

ALTER TABLE comics
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS purchase_date DATE;
