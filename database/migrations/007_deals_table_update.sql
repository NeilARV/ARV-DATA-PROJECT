-- ============================================================================
-- Migration 007: Decouple deals from properties table
-- - Drop FK constraint on property_id (keep column, now nullable)
-- - Make msa_id nullable
-- - Add address/location columns directly to deals
-- - Add price, beds, baths, sqft, property_type columns directly to deals
-- ============================================================================

-- Drop the FK constraint and NOT NULL on property_id
ALTER TABLE deals DROP CONSTRAINT deals_property_id_fkey;
ALTER TABLE deals ALTER COLUMN property_id DROP NOT NULL;

-- Add address/location fields directly to deals
ALTER TABLE deals ADD COLUMN address   TEXT;
ALTER TABLE deals ADD COLUMN city      TEXT;
ALTER TABLE deals ADD COLUMN state     VARCHAR(2);
ALTER TABLE deals ADD COLUMN zip_code  VARCHAR(10);

-- Add property detail fields directly to deals
ALTER TABLE deals ADD COLUMN price         DECIMAL(15, 2);
ALTER TABLE deals ADD COLUMN beds          INTEGER;
ALTER TABLE deals ADD COLUMN baths         DECIMAL(3, 1);
ALTER TABLE deals ADD COLUMN sqft          INTEGER;
ALTER TABLE deals ADD COLUMN property_type VARCHAR(100);
