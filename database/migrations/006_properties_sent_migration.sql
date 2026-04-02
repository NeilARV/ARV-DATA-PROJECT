-- Table tracking all property ids sent in email update
CREATE TABLE sent_property_ids (
    property_id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
