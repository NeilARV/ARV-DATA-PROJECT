-- Table tracking all property ids sent in email update
CREATE TABLE sent_property_ids (
    property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Drop email_sync_state as it is no longer used for any send/skip logic
DROP TABLE IF EXISTS email_sync_state;
