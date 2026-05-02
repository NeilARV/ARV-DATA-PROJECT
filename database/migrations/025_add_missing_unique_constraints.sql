-- Reconcile unique constraint names between prod (PostgreSQL auto-named *_key)
-- and Drizzle's expected names (*_unique). Without this, db:push prompts
-- interactively for every table on each deploy.
--
-- Strategy:
--   - Tables with both *_key and *_unique (already duplicated by a prior push):
--     drop the redundant *_key.
--   - Tables with only *_key: drop it and re-add with the Drizzle-expected name.
--   - All blocks are idempotent via EXCEPTION WHEN.

-- ── Already have both — drop the old *_key duplicate ────────────────────────

DO $$ BEGIN
    ALTER TABLE statuses DROP CONSTRAINT statuses_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE companies DROP CONSTRAINT companies_company_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE msas DROP CONSTRAINT msas_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE properties DROP CONSTRAINT properties_sfr_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── Only have *_key — rename to *_unique ─────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE addresses DROP CONSTRAINT addresses_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE addresses ADD CONSTRAINT addresses_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE assessments DROP CONSTRAINT assessments_property_id_assessed_year_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE assessments ADD CONSTRAINT assessments_property_id_assessed_year_unique UNIQUE (property_id, assessed_year);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE current_sales DROP CONSTRAINT current_sales_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE current_sales ADD CONSTRAINT current_sales_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exemptions DROP CONSTRAINT exemptions_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE exemptions ADD CONSTRAINT exemptions_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE last_sales DROP CONSTRAINT last_sales_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE last_sales ADD CONSTRAINT last_sales_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE market_scan_queue DROP CONSTRAINT market_scan_queue_sfr_market_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE market_scan_queue ADD CONSTRAINT market_scan_queue_sfr_market_id_unique UNIQUE (sfr_market_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE parcels DROP CONSTRAINT parcels_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE parcels ADD CONSTRAINT parcels_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE pre_foreclosures DROP CONSTRAINT pre_foreclosures_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE pre_foreclosures ADD CONSTRAINT pre_foreclosures_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE school_districts DROP CONSTRAINT school_districts_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE school_districts ADD CONSTRAINT school_districts_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE structures DROP CONSTRAINT structures_property_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE structures ADD CONSTRAINT structures_property_id_unique UNIQUE (property_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE tax_records DROP CONSTRAINT tax_records_property_id_tax_year_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE tax_records ADD CONSTRAINT tax_records_property_id_tax_year_unique UNIQUE (property_id, tax_year);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE valuations DROP CONSTRAINT valuations_property_id_valuation_date_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE valuations ADD CONSTRAINT valuations_property_id_valuation_date_unique UNIQUE (property_id, valuation_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE roles DROP CONSTRAINT roles_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE account_types DROP CONSTRAINT account_types_name_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE account_types ADD CONSTRAINT account_types_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE email_subscription_list DROP CONSTRAINT email_subscription_list_email_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE email_subscription_list ADD CONSTRAINT email_subscription_list_email_unique UNIQUE (email);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
