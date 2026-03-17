-- ============================================================================
-- MIGRATION 003: Email Sync State — Sent Property IDs
-- Replaces the single last_property_id UUID column with a JSONB array that
-- stores all property IDs sent in the most recent email for each MSA.
-- This prevents properties from re-appearing in consecutive emails when a
-- new property pushes previous ones down in position.
-- ============================================================================

ALTER TABLE email_sync_state
DROP COLUMN IF EXISTS last_property_id;

ALTER TABLE email_sync_state
ADD COLUMN last_sent_property_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
