-- Migration 018: Remove on-market status tags (on-market data unreliable)
-- Reversible: to revert, remove the in-renovation statuses added here and restore on-market.
--
-- Schema notes:
--   property_statuses.status_id  → FK to statuses(id); filter by joining statuses table
--   address fields               → live in addresses table, not properties

-- ============================================================
-- PREVIEW QUERIES — run these first to see what will change
-- ============================================================

-- Preview 1: property_statuses rows where on-market is the ONLY status
--            (these will have their status_id flipped to in-renovation)
-- SELECT ps.property_id, a.formatted_street_address, a.city, a.state
-- FROM property_statuses ps
-- JOIN statuses s       ON s.id = ps.status_id
-- JOIN properties p     ON p.id = ps.property_id
-- LEFT JOIN addresses a ON a.property_id = p.id
-- WHERE s.name = 'on-market'
--   AND ps.property_id NOT IN (
--     SELECT ps2.property_id
--     FROM property_statuses ps2
--     JOIN statuses s2 ON s2.id = ps2.status_id
--     WHERE s2.name != 'on-market'
--   );

-- -- Preview 2: property_statuses rows where on-market exists alongside other statuses
-- --            (these rows will be deleted)
-- SELECT ps.property_id, a.formatted_street_address, a.city, a.state
-- FROM property_statuses ps
-- JOIN statuses s       ON s.id = ps.status_id
-- JOIN properties p     ON p.id = ps.property_id
-- LEFT JOIN addresses a ON a.property_id = p.id
-- WHERE s.name = 'on-market'
--   AND ps.property_id IN (
--     SELECT ps2.property_id
--     FROM property_statuses ps2
--     JOIN statuses s2 ON s2.id = ps2.status_id
--     WHERE s2.name != 'on-market'
--   );

-- -- Summary counts
-- SELECT
--   (
--     SELECT COUNT(*)
--     FROM property_statuses ps
--     JOIN statuses s ON s.id = ps.status_id
--     WHERE s.name = 'on-market'
--       AND ps.property_id NOT IN (
--         SELECT ps2.property_id
--         FROM property_statuses ps2
--         JOIN statuses s2 ON s2.id = ps2.status_id
--         WHERE s2.name != 'on-market'
--       )
--   ) AS will_flip_to_in_renovation,
--   (
--     SELECT COUNT(*)
--     FROM property_statuses ps
--     JOIN statuses s ON s.id = ps.status_id
--     WHERE s.name = 'on-market'
--       AND ps.property_id IN (
--         SELECT ps2.property_id
--         FROM property_statuses ps2
--         JOIN statuses s2 ON s2.id = ps2.status_id
--         WHERE s2.name != 'on-market'
--       )
--   ) AS will_delete,
--   (
--     SELECT COUNT(*)
--     FROM property_statuses ps
--     JOIN statuses s ON s.id = ps.status_id
--     WHERE s.name = 'on-market'
--   ) AS total_on_market_status_rows;

-- ============================================================
-- MIGRATION — uncomment and run after reviewing the preview
-- ============================================================

-- 1. For properties whose ONLY status is on-market, insert in-renovation then delete on-market.
--    INSERT ... ON CONFLICT DO NOTHING guards against the rare case where in-renovation already exists.
INSERT INTO property_statuses (property_id, status_id)
SELECT ps.property_id, (SELECT id FROM statuses WHERE name = 'in-renovation')
FROM property_statuses ps
JOIN statuses s ON s.id = ps.status_id
WHERE s.name = 'on-market'
  AND ps.property_id NOT IN (
    SELECT ps2.property_id
    FROM property_statuses ps2
    JOIN statuses s2 ON s2.id = ps2.status_id
    WHERE s2.name != 'on-market'
  )
ON CONFLICT DO NOTHING;

-- 2. Delete any remaining on-market status rows (properties that already have another status).
DELETE FROM property_statuses
WHERE status_id = (SELECT id FROM statuses WHERE name = 'on-market');

-- (No step 3: properties table has no status column; status is fully managed via property_statuses)
