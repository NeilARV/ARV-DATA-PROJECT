-- Migration 020: Indexes on property_transactions for directory sort queries
--
-- All directory sort queries do full-table scans on property_transactions because
-- no indexes existed. These cover the filter/join columns used by each sort option.

-- Partial index for "most properties" sort: only indexes sort_order=1 rows
-- (the most-recent-transaction-per-property check), keeping the index small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_buyer_sort1
    ON property_transactions (buyer_id)
    WHERE sort_order = 1;

-- Covers YTD and all-time sold queries: seller_id + recording_date range filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_seller_date
    ON property_transactions (seller_id, recording_date);

-- Covers YTD and all-time bought queries: buyer_id + recording_date range filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_buyer_date
    ON property_transactions (buyer_id, recording_date);

-- Covers the wholesale EXISTS subquery self-join:
-- pt_prior WHERE property_id = ? AND buyer_id = ? AND recording_date <= ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_property_buyer_date
    ON property_transactions (property_id, buyer_id, recording_date);
