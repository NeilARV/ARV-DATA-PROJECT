-- Migration: 017
-- Description:
--   Add sort_order column to property_transactions.
--   Lower value = more recent (displayed first). NULL-safe: NULLs sort last.
--   Populated by the seed-sort-order script after running this migration.

ALTER TABLE property_transactions
ADD COLUMN sort_order INTEGER DEFAULT NULL;

ALTER TABLE property_transactions
ADD COLUMN user_created BOOLEAN NOT NULL DEFAULT FALSE;
