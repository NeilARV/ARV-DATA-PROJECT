-- ============================================================================
-- Migration 009: Replace property_id (UUID FK) with sfr_property_id (BIGINT)
--               on streetview_cache
-- Steps:
--   1. Add sfr_property_id column
--   2. Backfill from properties table via existing property_id FK
--   3. Drop old indexes that reference property_id
--   4. Drop property_id column
--   5. Add new index on sfr_property_id
-- ============================================================================

-- Step 1: Add the new column (nullable — not every cache row will have one)
ALTER TABLE streetview_cache ADD COLUMN sfr_property_id BIGINT;

-- Step 2: Backfill — join through the existing FK to get the sfr_property_id
UPDATE streetview_cache sc
SET sfr_property_id = p.sfr_property_id
FROM properties p
WHERE sc.property_id = p.id;

-- Step 3: Drop old indexes that reference property_id
DROP INDEX IF EXISTS idx_streetview_cache_property_id;
DROP INDEX IF EXISTS idx_streetview_cache_property_lookup;

-- Step 4: Drop the old FK column
ALTER TABLE streetview_cache DROP COLUMN property_id;

-- Step 5: Add index on sfr_property_id for lookups
CREATE INDEX idx_streetview_cache_sfr_property_id ON streetview_cache(sfr_property_id);
