-- Insert new role into roles table
INSERT INTO roles (name)
VALUES ('pro');

-- Deal feed table
-- id is BIGSERIAL so insertion order == feed order; query ORDER BY id DESC for newest-first.
-- property_id links to the existing properties table (property is created/processed normally first).
-- posted_by tracks which user submitted the deal announcement.
-- Multiple posts of the same property are allowed — no uniqueness constraint on property_id.
-- Scheduled job prunes rows WHERE created_at < NOW() - INTERVAL '30 days'.
CREATE TABLE deals (
    id              BIGSERIAL     PRIMARY KEY,
    property_id     UUID          NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    posted_by       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deals_feed      ON deals(id DESC);
CREATE INDEX idx_deals_created_at ON deals(created_at);
CREATE INDEX idx_deals_posted_by ON deals(posted_by);
CREATE INDEX idx_deals_property  ON deals(property_id);