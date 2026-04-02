-- Table tracking all property ids sent in email update
CREATE TABLE sent_property_ids (
    property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
