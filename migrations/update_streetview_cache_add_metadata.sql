-- Migration: Update streetview_cache table to support metadata status
-- This allows caching negative results (no image available) to avoid repeated API calls
-- Run this SQL in your PostgreSQL database console if the table already exists

-- Add metadata_status column if it doesn't exist
ALTER TABLE streetview_cache 
ADD COLUMN IF NOT EXISTS metadata_status TEXT;

-- Make image_data nullable (to support caching negative results)
ALTER TABLE streetview_cache 
ALTER COLUMN image_data DROP NOT NULL;

-- Make content_type nullable (since it's null when no image is available)
ALTER TABLE streetview_cache 
ALTER COLUMN content_type DROP NOT NULL;

-- Update comment for metadata_status
COMMENT ON COLUMN streetview_cache.metadata_status IS 'Status from Google Metadata API: OK (image available), ZERO_RESULTS, NOT_FOUND, etc.';

-- Update comment for image_data
COMMENT ON COLUMN streetview_cache.image_data IS 'Binary image data stored as BYTEA (nullable - null if metadata indicates no image available)';

