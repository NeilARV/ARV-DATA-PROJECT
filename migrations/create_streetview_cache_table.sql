-- Migration: Create streetview_cache table
-- This table caches Google Street View images for 30 days to reduce API calls
-- Run this SQL in your PostgreSQL database console

CREATE TABLE IF NOT EXISTS streetview_cache (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id VARCHAR REFERENCES properties(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '600x400',
    image_data BYTEA, -- Binary image data (nullable - null if no image available)
    content_type TEXT DEFAULT 'image/jpeg',
    metadata_status TEXT, -- Status from Google Metadata API (e.g., 'OK', 'ZERO_RESULTS', 'NOT_FOUND')
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_streetview_cache_address ON streetview_cache(LOWER(TRIM(address)));
CREATE INDEX IF NOT EXISTS idx_streetview_cache_city ON streetview_cache(LOWER(TRIM(city)));
CREATE INDEX IF NOT EXISTS idx_streetview_cache_state ON streetview_cache(LOWER(TRIM(state)));
CREATE INDEX IF NOT EXISTS idx_streetview_cache_size ON streetview_cache(TRIM(size));
CREATE INDEX IF NOT EXISTS idx_streetview_cache_property_id ON streetview_cache(property_id);
CREATE INDEX IF NOT EXISTS idx_streetview_cache_expires_at ON streetview_cache(expires_at);

-- Composite index for common lookup pattern (address + city + state + size + expires_at)
CREATE INDEX IF NOT EXISTS idx_streetview_cache_lookup ON streetview_cache(
    LOWER(TRIM(address)),
    LOWER(TRIM(city)),
    LOWER(TRIM(state)),
    TRIM(size),
    expires_at
);

-- Index for property_id lookups
CREATE INDEX IF NOT EXISTS idx_streetview_cache_property_lookup ON streetview_cache(property_id, expires_at);

COMMENT ON TABLE streetview_cache IS 'Caches Google Street View images and metadata for 30 days to reduce API calls';
COMMENT ON COLUMN streetview_cache.image_data IS 'Binary image data stored as BYTEA (nullable - null if metadata indicates no image available)';
COMMENT ON COLUMN streetview_cache.metadata_status IS 'Status from Google Metadata API: OK (image available), ZERO_RESULTS, NOT_FOUND, etc.';
COMMENT ON COLUMN streetview_cache.expires_at IS 'Timestamp when cache entry expires (30 days after created_at)';

