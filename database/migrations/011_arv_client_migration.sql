-- Migration: 011
-- Description: Add is_arv_client to companies table and is_arv_funded to properties table

ALTER TABLE properties
ADD COLUMN is_arv_funded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE companies
ADD COLUMN is_arv_client BOOLEAN NOT NULL DEFAULT FALSE;


-- Find ARV Funded properties that already exist and set is_arv_funded to true
WITH latest_tx AS (
    SELECT DISTINCT ON (pt.property_id)
        pt.property_id,
        pt.first_mtg_lender_name
    FROM property_transactions pt
    ORDER BY 
        pt.property_id,
        pt.recording_date DESC NULLS LAST,
        pt.property_transactions_id DESC
)
UPDATE properties p
SET is_arv_funded = TRUE
FROM latest_tx lt
WHERE p.id = lt.property_id
  AND UPPER(TRIM(lt.first_mtg_lender_name)) = 'ARV FINANCE INC';

  -- Find ARV Client properties that already exist and set is_arv_client to true
  UPDATE companies c
SET is_arv_client = TRUE
WHERE c.id IN (
    SELECT DISTINCT pt.buyer_id
    FROM property_transactions pt
    WHERE UPPER(TRIM(pt.first_mtg_lender_name)) = 'ARV FINANCE INC'
      AND pt.buyer_id IS NOT NULL

    UNION

    SELECT DISTINCT pt.seller_id
    FROM property_transactions pt
    WHERE UPPER(TRIM(pt.first_mtg_lender_name)) = 'ARV FINANCE INC'
      AND pt.seller_id IS NOT NULL
);