-- ============================================================================
-- MIGRATION 002: Market Scan Queue
-- Drops legacy sfr_sync_state table (replaced by the new sliding-window
-- scanner approach) and creates the market_scan_queue staging table used
-- by the v2 data pipeline.
-- ============================================================================

-- Drop legacy sync state table (cursor-based approach is replaced)
DROP TABLE IF EXISTS sfr_sync_state;

-- ============================================================================
-- MARKET SCAN QUEUE
-- Staging table for the v2 data pipeline. Scanner jobs enqueue buyer market
-- records here; the consumer job processes and marks them done.
-- Unique on sfr_market_id so the same market record seen by multiple
-- time-window scanners is only enqueued once.
-- ============================================================================

CREATE TABLE market_scan_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- SFR identifiers
    sfr_market_id INTEGER UNIQUE NOT NULL,
    sfr_property_id BIGINT NOT NULL,

    -- Location (used to build the batch lookup address)
    address TEXT,
    city TEXT,
    state VARCHAR(2),
    zip_code VARCHAR(10),
    msa_id INTEGER NOT NULL REFERENCES msas(id) ON DELETE RESTRICT,

    -- Transaction fields (used by cleanTransactions to verify/inject buyer tx)
    sale_date DATE NOT NULL,
    recording_date DATE NOT NULL,
    buyer_name TEXT,
    seller_name TEXT,
    sale_value DECIMAL(15, 2),
    lender_name TEXT,
    is_corporate BOOLEAN,
    is_private_lender BOOLEAN,
    property_type TEXT,

    -- Full raw payload from /buyers/market
    raw_data JSONB NOT NULL,

    -- Pipeline tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | processing | complete | failed
    scan_window VARCHAR(10),                         -- 0-22d | 20-46d | 44-76d | 74-91d
    error_message TEXT,
    enqueued_at TIMESTAMP NOT NULL DEFAULT now(),
    processed_at TIMESTAMP
);

CREATE INDEX idx_msq_status ON market_scan_queue(status);
CREATE INDEX idx_msq_sfr_property_id ON market_scan_queue(sfr_property_id);
CREATE INDEX idx_msq_msa_id ON market_scan_queue(msa_id);
CREATE INDEX idx_msq_msa_status ON market_scan_queue(msa_id, status);
CREATE INDEX idx_msq_enqueued_at ON market_scan_queue(enqueued_at);

-- ============================================================================
-- STATUSES
-- Lookup table for property status names. Seeded with the four known statuses.
-- ============================================================================

CREATE TABLE statuses (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

INSERT INTO statuses (name) VALUES
    ('in-renovation'),
    ('on-market'),
    ('sold'),
    ('wholesale');

-- ============================================================================
-- PROPERTY_STATUSES
-- Junction table: a property can have multiple statuses simultaneously.
-- Properties.status (VARCHAR) is kept for backward compatibility during
-- the transition period — do not drop it until all reads are migrated.
-- ============================================================================

CREATE TABLE property_statuses (
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    status_id   INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, status_id)
);

CREATE INDEX idx_property_statuses_property_id ON property_statuses(property_id);
CREATE INDEX idx_property_statuses_status_id   ON property_statuses(status_id);

-- Backfill from properties.status (skip nulls / empty strings / unknown names)
INSERT INTO property_statuses (property_id, status_id)
SELECT p.id, s.id
FROM   properties p
JOIN   statuses s ON s.name = LOWER(TRIM(p.status))
WHERE  p.status IS NOT NULL AND p.status != ''
ON CONFLICT DO NOTHING;

ALTER TABLE properties
DROP COLUMN IF EXISTS status;