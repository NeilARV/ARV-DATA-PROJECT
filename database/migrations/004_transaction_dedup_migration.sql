-- ============================================================================
-- MIGRATION 004: Market Scan Queue — property deduplication constraint
-- Adds a composite unique constraint on (msa_id, sfr_property_id) to enforce
-- the one-row-per-property-per-MSA invariant at the database level.
-- Run the duplicate cleanup query before applying this migration.
-- ============================================================================

ALTER TABLE market_scan_queue
ADD CONSTRAINT uq_msq_msa_property UNIQUE (msa_id, sfr_property_id);