CREATE TABLE deal_links (
    deal_id     BIGINT  NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 1,
    url         TEXT    NOT NULL,
    domain      TEXT    NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT now(),
    PRIMARY KEY (deal_id, sort_order)
);
