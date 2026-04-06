-- ============================================================================
-- Migration 008: Replace property_id (UUID FK) with sfr_property_id (BIGINT)
-- - Drop property_id column (no longer used; FK was already dropped in 007)
-- - Add sfr_property_id BIGINT column (nullable; populated when SFR lookup succeeds)
-- ============================================================================

ALTER TABLE deals DROP COLUMN IF EXISTS property_id;
ALTER TABLE deals ADD COLUMN sfr_property_id BIGINT;

CREATE INDEX idx_deals_sfr_property_id ON deals(sfr_property_id);
