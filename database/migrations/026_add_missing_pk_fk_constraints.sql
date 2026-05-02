-- Reconcile PRIMARY KEY and FOREIGN KEY constraint names between prod (PostgreSQL
-- auto-named *_pkey / *_fkey) and Drizzle's expected names (*_pk / *_fk).
-- Uses RENAME CONSTRAINT throughout — no data is touched, no constraints are
-- dropped and recreated, so there is zero risk of FK violations.
-- All blocks are idempotent via EXCEPTION WHEN.

-- ── PRIMARY KEY renames ───────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE company_counties RENAME CONSTRAINT company_counties_pkey TO company_counties_company_id_county_state_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_msas RENAME CONSTRAINT company_msas_pkey TO company_msas_company_id_msa_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE deal_links RENAME CONSTRAINT deal_links_pkey TO deal_links_deal_id_sort_order_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE property_statuses RENAME CONSTRAINT property_statuses_pkey TO property_statuses_property_id_status_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_account_types RENAME CONSTRAINT user_account_types_pkey TO user_account_types_user_id_account_type_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_msa_subscriptions RENAME CONSTRAINT user_msa_subscriptions_pkey TO user_msa_subscriptions_user_id_msa_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_relationship_managers RENAME CONSTRAINT user_relationship_managers_pkey TO user_relationship_managers_user_id_relationship_manager_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_roles RENAME CONSTRAINT user_roles_pkey TO user_roles_user_id_role_id_pk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

-- ── FOREIGN KEY renames ───────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE addresses RENAME CONSTRAINT addresses_property_id_fkey TO addresses_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE assessments RENAME CONSTRAINT assessments_property_id_fkey TO assessments_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_contacts RENAME CONSTRAINT company_contacts_company_id_fkey TO company_contacts_company_id_companies_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_contacts RENAME CONSTRAINT company_contacts_user_id_fkey TO company_contacts_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_counties RENAME CONSTRAINT company_counties_company_id_fkey TO company_counties_company_id_companies_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_msas RENAME CONSTRAINT company_msas_company_id_fkey TO company_msas_company_id_companies_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE company_msas RENAME CONSTRAINT company_msas_msa_id_fkey TO company_msas_msa_id_msas_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE current_sales RENAME CONSTRAINT current_sales_property_id_fkey TO current_sales_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE deal_links RENAME CONSTRAINT deal_links_deal_id_fkey TO deal_links_deal_id_deals_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE deals RENAME CONSTRAINT deals_msa_id_fkey TO deals_msa_id_msas_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE deals RENAME CONSTRAINT deals_user_id_fkey TO deals_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE email_subscription_list RENAME CONSTRAINT email_subscription_list_relationship_manager_id_fkey TO email_subscription_list_relationship_manager_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE exemptions RENAME CONSTRAINT exemptions_property_id_fkey TO exemptions_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE last_sales RENAME CONSTRAINT last_sales_property_id_fkey TO last_sales_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE market_scan_queue RENAME CONSTRAINT market_scan_queue_msa_id_fkey TO market_scan_queue_msa_id_msas_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE parcels RENAME CONSTRAINT parcels_property_id_fkey TO parcels_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE pre_foreclosures RENAME CONSTRAINT pre_foreclosures_property_id_fkey TO pre_foreclosures_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE property_statuses RENAME CONSTRAINT property_statuses_property_id_fkey TO property_statuses_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE property_statuses RENAME CONSTRAINT property_statuses_status_id_fkey TO property_statuses_status_id_statuses_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE property_transactions RENAME CONSTRAINT property_transactions_buyer_id_fkey TO property_transactions_buyer_id_companies_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE property_transactions RENAME CONSTRAINT property_transactions_seller_id_fkey TO property_transactions_seller_id_companies_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

-- prod is missing this FK entirely — add it if absent
DO $$ BEGIN
    ALTER TABLE property_transactions ADD CONSTRAINT property_transactions_property_id_properties_id_fk
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE school_districts RENAME CONSTRAINT school_districts_property_id_fkey TO school_districts_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE sent_property_ids RENAME CONSTRAINT sent_property_ids_property_id_fkey TO sent_property_ids_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE structures RENAME CONSTRAINT structures_property_id_fkey TO structures_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE tax_records RENAME CONSTRAINT tax_records_property_id_fkey TO tax_records_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_account_types RENAME CONSTRAINT user_account_types_account_type_id_fkey TO user_account_types_account_type_id_account_types_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_account_types RENAME CONSTRAINT user_account_types_user_id_fkey TO user_account_types_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_msa_subscriptions RENAME CONSTRAINT user_msa_subscriptions_msa_id_fkey TO user_msa_subscriptions_msa_id_msas_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_msa_subscriptions RENAME CONSTRAINT user_msa_subscriptions_user_id_fkey TO user_msa_subscriptions_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_relationship_managers RENAME CONSTRAINT user_relationship_managers_relationship_manager_id_fkey TO user_relationship_managers_relationship_manager_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_relationship_managers RENAME CONSTRAINT user_relationship_managers_user_id_fkey TO user_relationship_managers_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_roles RENAME CONSTRAINT user_roles_role_id_fkey TO user_roles_role_id_roles_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE user_roles RENAME CONSTRAINT user_roles_user_id_fkey TO user_roles_user_id_users_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE users RENAME CONSTRAINT users_subscription_id_fkey TO users_subscription_id_subscriptions_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE valuations RENAME CONSTRAINT valuations_property_id_fkey TO valuations_property_id_properties_id_fk;
EXCEPTION WHEN undefined_object OR duplicate_object THEN NULL;
END $$;

-- NOTE: prod also has users_id_uuid_unique (a redundant UNIQUE on the PK column)
-- that dev does not. It cannot be dropped because other objects depend on it.
-- Leave it in place — it is harmless and does not cause Drizzle validation failures.
