-- ============================================================================
-- Migration: VARCHAR(100) to TEXT for selected columns
-- Run this against an existing database to align column types with the schema.
-- ============================================================================

-- Parcels: section_township_range
ALTER TABLE parcels
  ALTER COLUMN section_township_range TYPE TEXT USING section_township_range::TEXT;

-- School districts: school_tax_district_1, school_tax_district_2, school_tax_district_3
ALTER TABLE school_districts
  ALTER COLUMN school_tax_district_1 TYPE TEXT USING school_tax_district_1::TEXT,
  ALTER COLUMN school_tax_district_2 TYPE TEXT USING school_tax_district_2::TEXT,
  ALTER COLUMN school_tax_district_3 TYPE TEXT USING school_tax_district_3::TEXT;

-- Pre-foreclosures: doc_type
ALTER TABLE pre_foreclosures
  ALTER COLUMN doc_type TYPE TEXT USING doc_type::TEXT;

-- Last sales: document_type, mtg_type
ALTER TABLE last_sales
  ALTER COLUMN document_type TYPE TEXT USING document_type::TEXT,
  ALTER COLUMN mtg_type TYPE TEXT USING mtg_type::TEXT;
