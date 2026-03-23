-- Insert new role into roles table
INSERT INTO roles (name)
VALUES ('pro');

-- Deal feed table
-- id is BIGSERIAL so insertion order == feed order; query ORDER BY id DESC for newest-first.
-- property_id links to the existing properties table (property is created/processed normally first).
-- user_id tracks which user submitted the deal announcement.
-- msa_id references the msas table directly so the feed can be filtered by MSA without joining properties.
-- Multiple posts of the same property are allowed — no uniqueness constraint on property_id.
-- Scheduled job prunes rows WHERE created_at < NOW() - INTERVAL '30 days'.
CREATE TABLE deals (
    id              BIGSERIAL     PRIMARY KEY,
    property_id     UUID          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    msa_id          INTEGER       NOT NULL REFERENCES msas(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_feed       ON deals(id DESC);
CREATE INDEX idx_deals_created_at ON deals(created_at);
CREATE INDEX idx_deals_user       ON deals(user_id);
CREATE INDEX idx_deals_property   ON deals(property_id);
CREATE INDEX idx_deals_msa        ON deals(msa_id);
