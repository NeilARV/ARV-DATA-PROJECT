ALTER TABLE users
    ADD COLUMN county TEXT,
    ADD COLUMN state  VARCHAR(2);

ALTER TABLE users
    ADD CONSTRAINT chk_users_county_requires_state
    CHECK (county IS NULL OR state IS NOT NULL);
