-- Remove buyer_id and seller_id from properties table.
-- Property ownership is now derived exclusively from property_transactions.
-- FK constraints on these columns are dropped automatically by PostgreSQL.

ALTER TABLE properties DROP COLUMN IF EXISTS buyer_id;
ALTER TABLE properties DROP COLUMN IF EXISTS seller_id;
