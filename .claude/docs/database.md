# Database Schema Reference

Drizzle ORM + PostgreSQL (Neon). All schemas live in `database/schemas/`. This document covers every table, its columns, constraints, and indexes.

---

## Table of Contents

- [Enums](#enums)
- [Users & Auth](#users--auth)
- [MSAs](#msas)
- [Companies](#companies)
- [Properties](#properties)
- [Sync / Pipeline](#sync--pipeline)
- [Statuses](#statuses)
- [Deals](#deals)
- [Vendors & Community](#vendors--community)
- [Mastermind](#mastermind)

---

## Enums

| Enum | Values | File |
|------|--------|------|
| `address_type` | `registered`, `mailing`, `head_office` | companies.schema.ts |
| `claim_status` | `pending`, `approved`, `rejected` | companies.schema.ts |
| `claim_type` | `claim`, `dispute` | companies.schema.ts |
| `member_role` | `owner`, `member` | companies.schema.ts |
| `deal_type` | `wholesale`, `agent`, `sold`, `reo` | deals.schema.ts |
| `channel_type` | `public`, `private`, `dm`, `group_dm` | mastermind.schema.ts (Phase 1 uses only `public`) |
| `channel_member_role` | `owner`, `admin`, `member` | mastermind.schema.ts |
| `notification_type` | `mention`, `channel_mention`, `deal_bid`, `announcement`,  | mastermind.schema.ts |

---

## Users & Auth

### `sessions`
Express/Passport session store.

| Column | Type | Constraints |
|--------|------|-------------|
| `sid` | `varchar` | PK |
| `sess` | `text` | NOT NULL |
| `expire` | `integer` | NOT NULL |

---

### `subscriptions`
Lookup table for subscription tiers (basic, pro, premium).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `varchar(20)` | NOT NULL, UNIQUE |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `first_name` | `text` | NOT NULL |
| `last_name` | `text` | NOT NULL |
| `phone` | `text` | NOT NULL |
| `email` | `text` | NOT NULL, UNIQUE |
| `password_hash` | `text` | NOT NULL |
| `must_reset_password` | `boolean` | NOT NULL, default false |
| `notifications` | `boolean` | NOT NULL, default true |
| `subscription_id` | `integer` | FK → `subscriptions.id` (set null) |
| `county` | `text` | default `'San Diego'` |
| `state` | `varchar(2)` | default `'CA'` |
| `profile_image_url` | `text` | nullable |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**Indexes:** unique constraint on `id` (`users_id_uuid_unique`)

---

### `roles`
Lookup: `owner`, `admin`, `relationship-manager`, `member`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL, UNIQUE |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `user_roles`
Many-to-many: users ↔ roles.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `role_id` | `integer` | NOT NULL, FK → `roles.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(user_id, role_id)`

---

### `account_types`
Lookup: `agent`, `investor`, `wholesaler`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL, UNIQUE |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `user_account_types`
Many-to-many: users ↔ account types.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `account_type_id` | `integer` | NOT NULL, FK → `account_types.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(user_id, account_type_id)`

---

### `user_notification_preferences`
One row per user. Created on first save.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | PK, FK → `users.id` (cascade) |
| `data_app_enabled` | `boolean` | NOT NULL, default true |
| `deal_notifications_enabled` | `boolean` | NOT NULL, default true |
| `vendor_notifications_enabled` | `boolean` | NOT NULL, default false |
| `analytics_enabled` | `boolean` | NOT NULL, default false |
| `data_app_status_filter` | `text[]` | NOT NULL, default `[]` — empty = all statuses |
| `deal_type_filter` | `text[]` | NOT NULL, default `[]` — empty = all types |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `user_relationship_managers`
Many-to-many: users ↔ relationship managers.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `relationship_manager_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(user_id, relationship_manager_id)`

---

### `email_subscription_list`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigserial` | PK |
| `email` | `text` | NOT NULL, UNIQUE |
| `msa` | `integer` | nullable (references `msas.id` logically) |
| `relationship_manager_id` | `uuid` | FK → `users.id` (set null) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

---

## MSAs

### `msas`
Metropolitan Statistical Areas (Denver, Miami, San Diego, LA, SF, Port St. Lucie, etc.).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL, UNIQUE |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `user_msa_subscriptions`
Many-to-many: users ↔ MSAs they subscribe to.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `msa_id` | `integer` | NOT NULL, FK → `msas.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(user_id, msa_id)`

---

## Companies

### `companies`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `company` | `text` | NOT NULL, UNIQUE |
| `is_arv_client` | `boolean` | NOT NULL, default false |
| `purchase_to_arv_ratio` | `numeric(6,4)` | nullable; avg of (seller purchase ÷ sale price) across the company's Arms Length sales — raw ratio, e.g. `0.7143`; NULL = no traceable sale |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `company_details`
Enriched corporate registry data. One-to-one with `companies`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `company_id` | `uuid` | NOT NULL, UNIQUE, FK → `companies.id` (cascade) |
| `jurisdiction_code` | `varchar(20)` | NOT NULL |
| `oc_company_number` | `varchar(50)` | NOT NULL |
| `incorporation_date` | `date` | nullable |
| `dissolution_date` | `date` | nullable |
| `company_type` | `varchar(100)` | nullable |
| `registry_url` | `text` | nullable |
| `branch` | `text` | nullable |
| `branch_status` | `text` | nullable |
| `inactive` | `boolean` | NOT NULL, default false |
| `source_name` | `text` | nullable |
| `source_url` | `text` | nullable |
| `agent_name` | `text` | nullable |
| `agent_address` | `text` | nullable |
| `alternative_names` | `jsonb` | nullable |
| `previous_names` | `jsonb` | nullable |
| `number_of_employees` | `integer` | nullable |
| `native_company_number` | `varchar(50)` | nullable |
| `alternate_registration_entities` | `jsonb` | nullable |
| `previous_registration_entities` | `jsonb` | nullable |
| `subsequent_registration_entities` | `jsonb` | nullable |
| `industry_codes` | `jsonb` | nullable |
| `identifiers` | `jsonb` | nullable |
| `trademark_registrations` | `jsonb` | nullable |
| `corporate_groupings` | `jsonb` | nullable |
| `financial_summary` | `text` | nullable |
| `home_company` | `text` | nullable |
| `controlling_entity` | `text` | nullable |
| `ultimate_beneficial_owners` | `jsonb` | nullable |
| `ultimate_controlling_company` | `text` | nullable |
| `filings` | `jsonb` | nullable |
| `enriched_at` | `timestamp` | NOT NULL, default now |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `company_addresses`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `address_type` | `address_type` enum | NOT NULL |
| `street_address` | `text` | nullable |
| `locality` | `text` | nullable |
| `region` | `varchar(10)` | nullable |
| `postal_code` | `varchar(20)` | nullable |
| `country` | `text` | nullable |
| `address_in_full` | `text` | nullable |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**Indexes:** `idx_company_addresses_company_id` on `(company_id)`

---

### `company_contacts`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `user_id` | `uuid` | FK → `users.id` (set null), nullable |
| `first_name` | `text` | NOT NULL |
| `last_name` | `text` | nullable |
| `email` | `text` | nullable |
| `phone_number` | `varchar(20)` | nullable |
| `title` | `text` | nullable |
| `address` | `text` | nullable |
| `sort_order` | `integer` | NOT NULL, default 1 |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**Indexes:**
- `idx_company_contacts_company_id` on `(company_id)`
- `idx_company_contacts_unique_name` (unique) on `(company_id, first_name, last_name)`

---

### `company_counties`
Counties a company operates in.

| Column | Type | Constraints |
|--------|------|-------------|
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `county` | `text` | NOT NULL |
| `state` | `varchar(2)` | NOT NULL |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(company_id, county, state)`

---

### `company_msas`
Many-to-many: companies ↔ MSAs.

| Column | Type | Constraints |
|--------|------|-------------|
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `msa_id` | `integer` | NOT NULL, FK → `msas.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(company_id, msa_id)`

---

### `company_claims`
User claims and disputes for company ownership.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `status` | `claim_status` enum | NOT NULL, default `pending` |
| `type` | `claim_type` enum | NOT NULL, default `claim` |
| `user_message` | `text` | nullable — optional message from claimant on submission |
| `admin_notes` | `text` | nullable |
| `admin_message` | `text` | nullable — message sent to claimant on approve/reject |
| `reviewed_by` | `uuid` | FK → `users.id` (set null), nullable |
| `reviewed_at` | `timestamp` | nullable |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**Indexes:**
- `idx_company_claims_user_status` on `(user_id, status)`
- `idx_company_claims_company_status` on `(company_id, status)`
- `idx_company_claims_status_created` on `(status, created_at)`
- `idx_company_claims_unique_active_user_company` (unique partial) on `(user_id, company_id)` WHERE `status != 'rejected'`

---

### `company_members`
Users who are members of a claimed company.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) |
| `role` | `member_role` enum | NOT NULL, default `owner` |
| `is_primary` | `boolean` | NOT NULL, default true |
| `created_at` | `timestamp` | NOT NULL, default now |

**PK:** `(user_id, company_id)`

**Indexes:**
- `idx_company_members_user_id` on `(user_id)`
- `idx_company_members_company_id` on `(company_id)`

---

## Properties

### `properties`
Core property record. Each row represents one SFR-tracked property.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `sfr_property_id` | `bigint` | NOT NULL, UNIQUE |
| `property_class_description` | `text` | nullable |
| `property_type` | `varchar(100)` | nullable |
| `vacant` | `varchar(50)` | nullable |
| `hoa` | `varchar(50)` | nullable |
| `owner_type` | `varchar(50)` | nullable |
| `purchase_method` | `varchar(50)` | nullable |
| `listing_status` | `varchar(50)` | nullable |
| `status` | `varchar(50)` | default `'in-renovation'` |
| `months_owned` | `integer` | nullable |
| `msa` | `varchar(200)` | nullable |
| `county` | `varchar(200)` | nullable |
| `is_arv_funded` | `boolean` | NOT NULL, default false |
| `created_at` | `timestamp` | default now |
| `updated_at` | `timestamp` | default now |

**Indexes:** `idx_properties_county_lower` on `lower(trim(county))`

---

### `addresses`
One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `addresses_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `formatted_street_address` | `varchar(200)` | nullable |
| `street_number` | `varchar(20)` | nullable |
| `street_suffix` | `varchar(20)` | nullable |
| `street_pre_direction` | `varchar(10)` | nullable |
| `street_name` | `varchar(100)` | nullable |
| `street_post_direction` | `varchar(10)` | nullable |
| `unit_type` | `varchar(20)` | nullable |
| `unit_number` | `varchar(20)` | nullable |
| `city` | `varchar(100)` | nullable |
| `county` | `varchar(100)` | nullable |
| `state` | `varchar(2)` | nullable |
| `zip_code` | `varchar(10)` | nullable |
| `zip_plus_four_code` | `varchar(10)` | nullable |
| `carrier_code` | `varchar(20)` | nullable |
| `latitude` | `decimal(10,8)` | nullable |
| `longitude` | `decimal(11,8)` | nullable |
| `geocoding_accuracy` | `varchar(200)` | nullable |
| `census_tract` | `varchar(20)` | nullable |
| `census_block` | `varchar(20)` | nullable |

**Indexes:**
- `idx_addresses_county_lower` on `lower(trim(county))`
- `idx_addresses_property_zip` on `(property_id, zip_code)` — covering index for zip-count queries
- `idx_addresses_street_number` on `(street_number)` — prefilter for the code-violation address matcher
- `idx_addresses_lat_lng` on `(latitude, longitude)` — supports the map viewport (bbox) range scan and map-extent MIN/MAX aggregates

---

### `assessments`
Annual tax assessments. One property can have many years.

| Column | Type | Constraints |
|--------|------|-------------|
| `assessments_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `assessed_year` | `integer` | NOT NULL |
| `land_value` | `decimal(15,2)` | nullable |
| `improvement_value` | `decimal(15,2)` | nullable |
| `assessed_value` | `decimal(15,2)` | nullable |
| `market_value` | `decimal(15,2)` | nullable |

**Unique:** `(property_id, assessed_year)`

---

### `exemptions`
One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `exemptions_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `homeowner` | `boolean` | nullable |
| `veteran` | `boolean` | nullable |
| `disabled` | `boolean` | nullable |
| `widow` | `boolean` | nullable |
| `senior` | `boolean` | nullable |
| `school` | `boolean` | nullable |
| `religious` | `boolean` | nullable |
| `welfare` | `boolean` | nullable |
| `public` | `boolean` | nullable |
| `cemetery` | `boolean` | nullable |
| `hospital` | `boolean` | nullable |
| `library` | `boolean` | nullable |

---

### `parcels`
One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `parcels_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `apn_original` | `varchar(50)` | nullable |
| `fips_code` | `varchar(10)` | nullable |
| `frontage_ft` | `varchar(20)` | nullable |
| `depth_ft` | `varchar(20)` | nullable |
| `area_acres` | `varchar(20)` | nullable |
| `area_sq_ft` | `integer` | nullable |
| `zoning` | `varchar(50)` | nullable |
| `county_land_use_code` | `varchar(20)` | nullable |
| `lot_number` | `varchar(50)` | nullable |
| `subdivision` | `varchar(200)` | nullable |
| `section_township_range` | `text` | nullable |
| `legal_description` | `text` | nullable |
| `state_land_use_code` | `varchar(20)` | nullable |
| `building_count` | `integer` | nullable |

---

### `school_districts`
One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `school_districts_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `school_tax_district_1` | `text` | nullable |
| `school_tax_district_2` | `text` | nullable |
| `school_tax_district_3` | `text` | nullable |
| `school_district_name` | `varchar(200)` | nullable |

---

### `structures`
Physical building details. One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `structures_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `total_area_sq_ft` | `integer` | nullable |
| `year_built` | `integer` | nullable |
| `effective_year_built` | `integer` | nullable |
| `beds_count` | `integer` | nullable |
| `rooms_count` | `integer` | nullable |
| `baths` | `decimal(3,1)` | nullable |
| `basement_type` | `varchar(50)` | nullable |
| `condition` | `varchar(50)` | nullable |
| `construction_type` | `varchar(50)` | nullable |
| `exterior_wall_type` | `varchar(50)` | nullable |
| `fireplaces` | `integer` | nullable |
| `heating_type` | `varchar(50)` | nullable |
| `heating_fuel_type` | `varchar(50)` | nullable |
| `parking_spaces_count` | `integer` | nullable |
| `pool_type` | `varchar(50)` | nullable |
| `quality` | `varchar(50)` | nullable |
| `roof_material_type` | `varchar(50)` | nullable |
| `roof_style_type` | `varchar(50)` | nullable |
| `sewer_type` | `varchar(50)` | nullable |
| `stories` | `varchar(50)` | nullable |
| `units_count` | `integer` | nullable |
| `water_type` | `varchar(50)` | nullable |
| `living_area_sqft` | `integer` | nullable |
| `ac_description` | `text` | nullable |
| `garage_description` | `text` | nullable |
| `building_class_description` | `text` | nullable |
| `sqft_description` | `text` | nullable |

---

### `tax_records`
Annual tax records. One property can have many years.

| Column | Type | Constraints |
|--------|------|-------------|
| `tax_records_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `tax_year` | `integer` | NOT NULL |
| `tax_amount` | `decimal(15,2)` | nullable |
| `tax_delinquent_year` | `integer` | nullable |
| `tax_rate_code_area` | `varchar(50)` | nullable |

**Unique:** `(property_id, tax_year)`

---

### `valuations`
AVM valuations over time. One property can have many valuation dates.

| Column | Type | Constraints |
|--------|------|-------------|
| `valuations_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `value` | `decimal(15,2)` | nullable |
| `high` | `decimal(15,2)` | nullable |
| `low` | `decimal(15,2)` | nullable |
| `forecast_standard_deviation` | `decimal(18,15)` | nullable |
| `valuation_date` | `date` | nullable |

**Unique:** `(property_id, valuation_date)`

---

### `pre_foreclosures`
One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `pre_foreclosures_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `flag` | `boolean` | nullable |
| `ind` | `varchar(50)` | nullable |
| `reason` | `text` | nullable |
| `doc_type` | `text` | nullable |
| `recording_date` | `date` | nullable |

---

### `last_sales`
Most recent sale data from the SFR feed. One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `last_sales_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `sale_date` | `date` | nullable |
| `recording_date` | `date` | nullable |
| `price` | `decimal(15,2)` | nullable |
| `document_type` | `text` | nullable |
| `mtg_amount` | `decimal(15,2)` | nullable |
| `mtg_type` | `text` | nullable |
| `lender` | `varchar(200)` | nullable |
| `mtg_interest_rate` | `varchar(20)` | nullable |
| `mtg_term_months` | `varchar(10)` | nullable |

---

### `current_sales`
Buyer/seller names from the current sale. One-to-one with `properties`.

| Column | Type | Constraints |
|--------|------|-------------|
| `current_sales_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, UNIQUE, FK → `properties.id` (cascade) |
| `doc_num` | `varchar(50)` | nullable |
| `buyer_1` | `varchar(200)` | nullable |
| `buyer_2` | `varchar(200)` | nullable |
| `seller_1` | `varchar(200)` | nullable |
| `seller_2` | `varchar(200)` | nullable |

---

### `property_transactions`
Full transaction history per property. Buyer/seller linked to `companies`.

| Column | Type | Constraints |
|--------|------|-------------|
| `property_transactions_id` | `serial` | PK |
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `seller_id` | `uuid` | FK → `companies.id` (set null), nullable |
| `seller_name` | `varchar(200)` | nullable |
| `buyer_id` | `uuid` | FK → `companies.id` (set null), nullable |
| `buyer_name` | `varchar(200)` | nullable |
| `is_assignment` | `boolean` | NOT NULL, default false — this sale was a wholesale assignment |
| `assignor_id` | `uuid` | FK → `companies.id` (set null), nullable — assignor company (set only when it matches an existing company) |
| `assignor_name` | `varchar(200)` | nullable — assignor display name (may be an individual with no company) |
| `apn` | `varchar(50)` | nullable |
| `transaction_type` | `varchar(50)` | nullable |
| `sale_date` | `date` | NOT NULL |
| `recording_date` | `date` | NOT NULL |
| `sale_price` | `decimal(15,2)` | nullable |
| `first_mtg_recording_date` | `date` | nullable |
| `first_mtg_amount` | `decimal(15,2)` | nullable |
| `first_mtg_lender_name` | `varchar(200)` | nullable |
| `first_mtg_due_date` | `date` | nullable |
| `sort_order` | `integer` | nullable |
| `user_created` | `boolean` | NOT NULL, default false |
| `created_at` | `timestamp` | default now |
| `updated_at` | `timestamp` | default now |

**Indexes:**
- `idx_pt_property_tx_type_sort` on `(property_id, lower(trim(transaction_type)), coalesce(sort_order, 999999), recording_date)` — primary query performance index for properties grid
- `idx_pt_type_property_date` on `(lower(trim(transaction_type)), property_id, recording_date)` — pre-aggregated MAX date for map filtering
- `idx_pt_property_buyer_date` on `(property_id, buyer_id, recording_date)`
- `idx_pt_seller_date` on `(seller_id, recording_date)`
- `idx_pt_buyer_date` on `(buyer_id, recording_date)` — most-bought-properties YTD/all-time queries
- `idx_pt_buyer_sort1` (partial) on `(buyer_id)` WHERE `sort_order = 1` — most recent transaction per buyer
- `idx_pt_property_seller` on `(property_id, seller_id)`
- `idx_pt_assignor` on `(assignor_id)` — company-filter assignor branch + per-company "properties assigned" count

> **Assignments** are recorded as columns on the actual arms-length **sale** row (`is_assignment` + `assignor_*`), not as a separate `transaction_type = 'assignment'` row. An assignment is a wholesale flip where a middleman ("assignor") never takes title, so the recorded deed is a direct seller→buyer sale; the assignor is surfaced as metadata on that sale. Admins set this per-transaction in the Edit Property dialog. The data pipeline preserves these columns across its per-property transaction rebuild (see `insert-properties.ts`).

---

### `streetview_cache`
Google Street View image cache. New images are stored in Supabase Storage and referenced by `storage_path` (the API redirects to the CDN URL); `image_data` (`bytea`) is the legacy store, kept only for rows cached before the Storage migration and lazily migrated on read.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `sfr_property_id` | `bigint` | nullable |
| `address` | `text` | NOT NULL |
| `city` | `text` | NOT NULL |
| `state` | `text` | NOT NULL |
| `size` | `text` | NOT NULL, default `'600x400'` |
| `image_data` | `bytea` | nullable — legacy/fallback bytes; null when stored in Supabase or a cached failure |
| `storage_path` | `text` | nullable — Supabase Storage path (e.g. `streetview/<hash>.jpg`); null for legacy + negative results |
| `content_type` | `text` | default `'image/jpeg'` |
| `metadata_status` | `text` | nullable — Google API status: `OK`, `ZERO_RESULTS`, `NOT_FOUND` |
| `image_source` | `text` | nullable — `'streetview'` \| `'satellite'` |
| `created_at` | `timestamp` | NOT NULL, default now |
| `expires_at` | `timestamp` | NOT NULL |

---

## Sync / Pipeline

### `market_scan_queue`
Work queue for the SFR data sync pipeline.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `sfr_market_id` | `bigint` | NOT NULL, UNIQUE |
| `sfr_property_id` | `bigint` | NOT NULL |
| `address` | `text` | nullable |
| `city` | `text` | nullable |
| `state` | `varchar(2)` | nullable |
| `zip_code` | `varchar(10)` | nullable |
| `msa_id` | `integer` | NOT NULL, FK → `msas.id` (restrict) |
| `sale_date` | `date` | NOT NULL |
| `recording_date` | `date` | NOT NULL |
| `buyer_name` | `text` | nullable |
| `seller_name` | `text` | nullable |
| `sale_value` | `decimal(15,2)` | nullable |
| `lender_name` | `text` | nullable |
| `is_corporate` | `boolean` | nullable |
| `is_private_lender` | `boolean` | nullable |
| `property_type` | `text` | nullable |
| `raw_data` | `jsonb` | NOT NULL |
| `status` | `varchar(20)` | NOT NULL, default `'pending'` |
| `scan_window` | `varchar(10)` | nullable |
| `error_message` | `text` | nullable |
| `enqueued_at` | `timestamp` | NOT NULL, default now |
| `processed_at` | `timestamp` | nullable |

**Unique:** `uq_msq_msa_property` on `(msa_id, sfr_property_id)`

---

### `sent_property_ids`
Tracks properties already included in email digests (deduplication).

| Column | Type | Constraints |
|--------|------|-------------|
| `property_id` | `uuid` | PK, FK → `properties.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |

---

## Statuses

### `statuses`
Lookup for property status values (`in-renovation`, `on-market`, `wholesale`, `sold`).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL, UNIQUE |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

---

### `property_statuses`
Many-to-many: properties ↔ statuses.

| Column | Type | Constraints |
|--------|------|-------------|
| `property_id` | `uuid` | NOT NULL, FK → `properties.id` (cascade) |
| `status_id` | `integer` | NOT NULL, FK → `statuses.id` (cascade) |
| `created_at` | `timestamp` | NOT NULL, default now |

**PK:** `(property_id, status_id)`

**Indexes:**
- `idx_property_statuses_property_id` on `(property_id)`
- `idx_property_statuses_status_id` on `(status_id)`

---

## Deals

### `deals`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigserial` | PK |
| `sfr_property_id` | `bigint` | nullable — populated when SFR lookup succeeds |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `msa_id` | `integer` | FK → `msas.id` (restrict), nullable |
| `type` | `deal_type` enum | NOT NULL |
| `address` | `text` | nullable |
| `city` | `text` | nullable |
| `state` | `varchar(2)` | nullable |
| `zip_code` | `varchar(10)` | NOT NULL |
| `county` | `varchar(100)` | nullable |
| `price` | `decimal(15,2)` | nullable |
| `potential_arv` | `decimal(15,2)` | nullable |
| `beds` | `integer` | nullable |
| `baths` | `decimal(3,1)` | nullable |
| `sqft` | `integer` | nullable |
| `property_type` | `varchar(100)` | nullable |
| `notes` | `text` | nullable |
| `admin_notes` | `text` | nullable |
| `showing_time` | `timestamp (string mode)` | nullable |
| `estimated_budget` | `integer` | nullable |
| `photos_url` | `text` | nullable |
| `is_arv_exclusive` | `boolean` | NOT NULL, default false |
| `on_behalf_of_email` | `text` | nullable — admin/RM only |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

---

### `deal_links`
Links attached to a deal (e.g. MLS, photos). Ordered by `sort_order`.

| Column | Type | Constraints |
|--------|------|-------------|
| `deal_id` | `bigint` | NOT NULL, FK → `deals.id` (cascade) |
| `sort_order` | `integer` | NOT NULL, default 1 |
| `url` | `text` | NOT NULL |
| `domain` | `text` | NOT NULL |
| `created_at` | `timestamp` | NOT NULL, default now |
| `updated_at` | `timestamp` | default now |

**PK:** `(deal_id, sort_order)`

---

### `deal_bids`
Non-binding offers ("bids") an investor submits on a deal. Full history — a user may submit
multiple offers on the same deal, each a separate row. Contact fields snapshot what the bidder
entered, so later profile edits don't rewrite past offers. Poster-private (read/delete gated to the
deal owner or `admin`/`owner`/`relationship-manager` in the service).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `bigserial` | PK |
| `deal_id` | `bigint` | NOT NULL, FK → `deals.id` (cascade) |
| `bidder_user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `amount` | `decimal(15,2)` | NOT NULL |
| `first_name` | `text` | NOT NULL |
| `last_name` | `text` | NOT NULL |
| `email` | `text` | NOT NULL |
| `phone` | `text` | nullable |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_deal_bids_deal_created` on `(deal_id, created_at DESC)` — poster's offer list

---

## Vendors & Community

### `categories`
Shared lookup for vendor trade categories and post tags (e.g. General Contractor, Plumber, Roofer).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL, UNIQUE |
| `slug` | `varchar(100)` | NOT NULL, UNIQUE |
| `description` | `text` | nullable |
| `icon_name` | `varchar(100)` | NOT NULL |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

---

### `vendors`
Vendor profiles. `user_id` is nullable for vendors not yet registered on the platform.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `name` | `text` | NOT NULL |
| `description` | `text` | nullable |
| `address` | `text` | nullable |
| `city` | `text` | nullable |
| `state` | `varchar(2)` | nullable |
| `zip_code` | `varchar(10)` | nullable |
| `phone` | `text` | nullable |
| `website` | `text` | nullable |
| `user_id` | `uuid` | FK → `users.id` (set null), nullable |
| `logo_url` | `text` | nullable |
| `header_url` | `text` | nullable |
| `is_recommended` | `boolean` | NOT NULL, default false |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:** `idx_vendors_user_id` on `(user_id)`

---

### `vendor_categories`
Many-to-many: vendors ↔ categories.

| Column | Type | Constraints |
|--------|------|-------------|
| `vendor_id` | `uuid` | NOT NULL, FK → `vendors.id` (cascade) |
| `category_id` | `integer` | NOT NULL, FK → `categories.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**PK:** `(vendor_id, category_id)`

---

### `posts`
Community posts where users share renovation/project updates.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `title` | `text` | NOT NULL |
| `content` | `text` | NOT NULL |
| `address` | `text` | nullable |
| `city` | `text` | nullable |
| `state` | `varchar(2)` | nullable |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_posts_user_id` on `(user_id)`
- `idx_posts_created_at` on `(created_at)`

---

### `post_categories`
Many-to-many: posts ↔ categories.

| Column | Type | Constraints |
|--------|------|-------------|
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `category_id` | `integer` | NOT NULL, FK → `categories.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**PK:** `(post_id, category_id)`

---

### `post_images`
Images attached to a post.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `serial` | PK |
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `image_url` | `text` | NOT NULL |
| `display_order` | `integer` | NOT NULL, default 1 |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:** `idx_post_images_post_id` on `(post_id)`

---

### `post_likes`
One like per user per post.

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**PK:** `(user_id, post_id)`

---

### `post_comments`
Supports one level of threaded replies via `parent_comment_id`.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `parent_comment_id` | `uuid` | FK → `post_comments.id` (cascade), nullable |
| `content` | `text` | NOT NULL |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_post_comments_post_id` on `(post_id)`
- `idx_post_comments_parent_id` on `(parent_comment_id)`

---

### `post_vendor_tags`
Vendors tagged/mentioned in a post.

| Column | Type | Constraints |
|--------|------|-------------|
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `vendor_id` | `uuid` | NOT NULL, FK → `vendors.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**PK:** `(post_id, vendor_id)`

---

### `post_user_tags`
Users tagged/mentioned in a post.

| Column | Type | Constraints |
|--------|------|-------------|
| `post_id` | `uuid` | NOT NULL, FK → `posts.id` (cascade) |
| `tagged_user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**PK:** `(post_id, tagged_user_id)`

---

## Mastermind

Schema for the Mastermind community app (`database/schemas/mastermind.schema.ts`). Phase 1 uses
all eight tables; only `public` channels are active. Messages are **soft-deleted only**
(`is_deleted` flag) — never hard-deleted. Deleting a channel cascades to all child rows.

### `channels`
A topic channel (e.g. `general`, `san-diego-market`).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `name` | `text` | NOT NULL, UNIQUE — lowercase slug |
| `description` | `text` | nullable — channel topic |
| `type` | `channel_type` enum | NOT NULL, default `'public'` |
| `created_by` | `uuid` | FK → `users.id` (set null), nullable |
| `is_archived` | `boolean` | NOT NULL, default false |
| `is_admin_only` | `boolean` | NOT NULL, default false — admin/owner-only visibility (service-enforced, not middleware) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

---

### `channel_members`
Per-user membership / read-state. Written lazily in Phase 1 (membership is otherwise implicit);
not consulted for authorization.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `channel_id` | `uuid` | NOT NULL, FK → `channels.id` (cascade) |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `role` | `channel_member_role` enum | NOT NULL, default `'member'` |
| `last_read_at` | `timestamp with time zone` | nullable — unread calculation |
| `last_read_message_id` | `uuid` | nullable (no FK) |
| `is_muted` | `boolean` | NOT NULL, default false |
| `joined_at` | `timestamp with time zone` | NOT NULL, default now |

**Unique:** `uq_channel_members_channel_user` on `(channel_id, user_id)`

**Indexes:**
- `idx_channel_members_user_id` on `(user_id)`

---

### `messages`
A channel message. `content` stores TipTap HTML.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `channel_id` | `uuid` | NOT NULL, FK → `channels.id` (cascade) |
| `sender_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `parent_message_id` | `uuid` | FK → `messages.id` (cascade), nullable — threads (Phase 2) |
| `content` | `text` | NOT NULL |
| `is_edited` | `boolean` | NOT NULL, default false |
| `is_deleted` | `boolean` | NOT NULL, default false — soft delete only |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |
| `updated_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_messages_channel_created` on `(channel_id, created_at DESC)` — history pagination + backfill
- `idx_messages_parent_id` on `(parent_message_id)` — thread loading (Phase 2)

---

### `message_attachments`
Files attached to a message. Images render inline; other types are download links.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `message_id` | `uuid` | NOT NULL, FK → `messages.id` (cascade) |
| `file_url` | `text` | NOT NULL — Supabase Storage URL |
| `file_name` | `text` | NOT NULL |
| `file_type` | `text` | NOT NULL — `image/*` inline, else download |
| `file_size_bytes` | `integer` | NOT NULL |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_message_attachments_message_id` on `(message_id)`

---

### `message_reactions`
Emoji reactions from the fixed set (👍 👎 😀 😢 😂 ✅).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `message_id` | `uuid` | NOT NULL, FK → `messages.id` (cascade) |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `emoji` | `text` | NOT NULL |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Unique:** `uq_message_reactions_message_user_emoji` on `(message_id, user_id, emoji)`

**Indexes:**
- `idx_message_reactions_message_id` on `(message_id)`

---

### `message_mentions`
A user mentioned in a message. `@here`/`@channel` are expanded to concrete users at notify time.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `message_id` | `uuid` | NOT NULL, FK → `messages.id` (cascade) |
| `mentioned_user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Unique:** `uq_message_mentions_message_user` on `(message_id, mentioned_user_id)`

**Indexes:**
- `idx_message_mentions_user_created` on `(mentioned_user_id, created_at DESC)` — mention feed

---

### `pinned_messages`
One pinned message per channel.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `message_id` | `uuid` | NOT NULL, FK → `messages.id` (cascade) |
| `channel_id` | `uuid` | NOT NULL, FK → `channels.id` (cascade) |
| `pinned_by` | `uuid` | FK → `users.id` (set null), nullable |
| `pinned_at` | `timestamp with time zone` | NOT NULL, default now |

**Unique:** `uq_pinned_messages_channel` on `(channel_id)` — one pin per channel

---

### `link_previews`
Global URL→metadata cache for message link unfurling. Write-once, kept forever. Not joined to
messages — a message references previews implicitly through the `<a href>` anchors in its sanitized
HTML, matched against this table by normalized URL at hydration time.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `url` | `text` | NOT NULL, UNIQUE — normalized (lowercase host, no `#fragment`) |
| `title` | `text` | nullable |
| `description` | `text` | nullable |
| `image` | `text` | nullable — og:image URL (remote) |
| `logo` | `text` | nullable — favicon URL (remote) |
| `publisher` | `text` | nullable — site name |
| `fetched_at` | `timestamp with time zone` | NOT NULL, default now |

**Unique:** `(url)` — both enforces write-once and indexes the cache-first lookup / batch hydration.

---

### `notifications`
The in-app bell feed. A row is created when a user is mentioned (or covered by `@here`/`@channel`),
or when an investor submits an offer on a deal (`deal_bid` → the deal's poster). Mention rows use
`channel_id`/`message_id`; `deal_bid` rows use `deal_id` + `metadata` instead.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `uuid` | PK, default random |
| `user_id` | `uuid` | NOT NULL, FK → `users.id` (cascade) — recipient |
| `type` | `notification_type` enum | NOT NULL — `mention` / `channel_mention` / `deal_bid` / `announcement` |
| `channel_id` | `uuid` | FK → `channels.id` (cascade), nullable |
| `message_id` | `uuid` | FK → `messages.id` (cascade), nullable — deep-link target |
| `deal_id` | `bigint` | FK → `deals.id` (cascade), nullable — `deal_bid` deep-link target |
| `metadata` | `jsonb` | nullable — `deal_bid` display payload `{ amount, address }` |
| `actor_id` | `uuid` | FK → `users.id` (set null), nullable — who triggered it (sender or bidder) |
| `is_read` | `boolean` | NOT NULL, default false |
| `emailed_at` | `timestamp with time zone` | nullable — supports the ≤3/day email cap |
| `created_at` | `timestamp with time zone` | NOT NULL, default now |

**Indexes:**
- `idx_notifications_user_read_created` on `(user_id, is_read, created_at DESC)` — bell feed + unread count
