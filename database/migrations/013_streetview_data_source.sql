ALTER TABLE streetview_cache ADD COLUMN image_source TEXT;
-- Values: 'streetview' | 'satellite' | null (for cached failures)

-- Backfill existing rows:
-- If content_type is not null, image exists and it came from Street View (only source prior to this migration)
-- If content_type is null, it's a cached failure — leave image_source as null
UPDATE streetview_cache
SET image_source = 'streetview'
WHERE content_type IS NOT NULL;