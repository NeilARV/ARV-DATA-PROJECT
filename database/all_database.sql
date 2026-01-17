-- ============================================================================
-- COMPLETE PROPERTY FLIP TRACKING DATABASE SCHEMA
-- Designed for tracking corporate property flips and renovations
-- ============================================================================

-- ============================================================================
-- USER MANAGEMENT TABLES
-- ============================================================================

-- Sessions table
CREATE TABLE sessions (
    sid VARCHAR PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
);

-- Email whitelist table
CREATE TABLE email_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX email_whitelist_email_key ON email_whitelist(email);

COMMENT ON TABLE email_whitelist IS 'Whitelist of approved email addresses for registration';

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    notifications BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_unique ON users(email);

COMMENT ON TABLE users IS 'User accounts and authentication information';

-- Companies table (corporate property flippers)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT UNIQUE NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    phone_number VARCHAR(20),
    counties JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX company_contacts_company_name_unique ON companies(company_name);
CREATE INDEX idx_companies_name ON companies(company_name);

COMMENT ON TABLE companies IS 'Corporate property flippers and investment companies';

-- SFR sync state table
CREATE TABLE sfr_sync_state (
    id SERIAL PRIMARY KEY,
    msa VARCHAR(255) UNIQUE NOT NULL,
    last_sale_date DATE,
    last_recording_date DATE,
    total_records_synced INTEGER DEFAULT 0,
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX sfr_sync_state_msa_key ON sfr_sync_state(msa);

COMMENT ON TABLE sfr_sync_state IS 'Tracks synchronization state for Single Family Residential properties by MSA';

-- ============================================================================
-- PROPERTY DATA TABLES
-- ============================================================================

-- Main property table
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sfr_property_id BIGINT UNIQUE NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    property_owner_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    property_class_description VARCHAR(100),
    property_type VARCHAR(100),
    vacant BOOLEAN,
    hoa VARCHAR(10),
    owner_type VARCHAR(50),
    purchase_method VARCHAR(50),
    listing_status VARCHAR(50),
    status VARCHAR(50) DEFAULT 'in-renovation',
    months_owned INTEGER,
    msa VARCHAR(200),
    county VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_properties_company_id ON properties(company_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_msa ON properties(msa);
CREATE INDEX idx_properties_county ON properties(county);
CREATE INDEX idx_properties_sfr_id ON properties(sfr_property_id);

COMMENT ON TABLE properties IS 'Main property table - current state of properties being tracked';
COMMENT ON COLUMN properties.id IS 'Internal UUID primary key';
COMMENT ON COLUMN properties.sfr_property_id IS 'External SFR Analytics API property ID';
COMMENT ON COLUMN properties.status IS 'Current status: in-renovation, on-market, or sold';
COMMENT ON COLUMN properties.company_id IS 'Current owner if corporate, NULL if sold to individual';

-- Address information
CREATE TABLE addresses (
    addresses_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    formatted_street_address VARCHAR(200),
    street_number VARCHAR(20),
    street_suffix VARCHAR(20),
    street_pre_direction VARCHAR(10),
    street_name VARCHAR(100),
    street_post_direction VARCHAR(10),
    unit_type VARCHAR(20),
    unit_number VARCHAR(20),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    zip_plus_four_code VARCHAR(10),
    carrier_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    geocoding_accuracy VARCHAR(200),
    census_tract VARCHAR(20),
    census_block VARCHAR(20)
);

CREATE INDEX idx_addresses_property_id ON addresses(property_id);
CREATE INDEX idx_addresses_location ON addresses(latitude, longitude);
CREATE INDEX idx_addresses_zip ON addresses(zip_code);
CREATE INDEX idx_addresses_city ON addresses(city);
CREATE INDEX idx_addresses_state ON addresses(state);

COMMENT ON TABLE addresses IS 'Physical address and location details for properties';

-- Assessments
CREATE TABLE assessments (
    assessments_id SERIAL PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    assessed_year INTEGER NOT NULL,
    land_value DECIMAL(15, 2),
    improvement_value DECIMAL(15, 2),
    assessed_value DECIMAL(15, 2),
    market_value DECIMAL(15, 2),
    UNIQUE(property_id, assessed_year)
);

CREATE INDEX idx_assessments_property_id ON assessments(property_id);
CREATE INDEX idx_assessments_year ON assessments(assessed_year);

COMMENT ON TABLE assessments IS 'Property assessment values by year';

-- Exemptions
CREATE TABLE exemptions (
    exemptions_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    homeowner BOOLEAN,
    veteran BOOLEAN,
    disabled BOOLEAN,
    widow BOOLEAN,
    senior BOOLEAN,
    school BOOLEAN,
    religious BOOLEAN,
    welfare BOOLEAN,
    public BOOLEAN,
    cemetery BOOLEAN,
    hospital BOOLEAN,
    library BOOLEAN
);

CREATE INDEX idx_exemptions_property_id ON exemptions(property_id);

COMMENT ON TABLE exemptions IS 'Tax exemptions for properties';

-- Parcel information
CREATE TABLE parcels (
    parcels_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    apn_original VARCHAR(50),
    fips_code VARCHAR(10),
    frontage_ft VARCHAR(20),
    depth_ft VARCHAR(20),
    area_acres VARCHAR(20),
    area_sq_ft INTEGER,
    zoning VARCHAR(50),
    county_land_use_code VARCHAR(20),
    lot_number VARCHAR(50),
    subdivision VARCHAR(200),
    section_township_range VARCHAR(100),
    legal_description TEXT,
    state_land_use_code VARCHAR(20),
    building_count INTEGER
);

CREATE INDEX idx_parcels_property_id ON parcels(property_id);
CREATE INDEX idx_parcels_apn ON parcels(apn_original);

COMMENT ON TABLE parcels IS 'Parcel and land information';

-- School districts
CREATE TABLE school_districts (
    school_districts_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    school_tax_district_1 VARCHAR(100),
    school_tax_district_2 VARCHAR(100),
    school_tax_district_3 VARCHAR(100),
    school_district_name VARCHAR(200)
);

CREATE INDEX idx_school_districts_property_id ON school_districts(property_id);

COMMENT ON TABLE school_districts IS 'School district information';

-- Structure/Building information
CREATE TABLE structures (
    structures_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    total_area_sq_ft INTEGER,
    year_built INTEGER,
    effective_year_built INTEGER,
    beds_count INTEGER,
    rooms_count INTEGER,
    baths DECIMAL(3, 1),
    basement_type VARCHAR(50),
    condition VARCHAR(50),
    construction_type VARCHAR(50),
    exterior_wall_type VARCHAR(50),
    fireplaces INTEGER,
    heating_type VARCHAR(50),
    heating_fuel_type VARCHAR(50),
    parking_spaces_count INTEGER,
    pool_type VARCHAR(50),
    quality VARCHAR(10),
    roof_material_type VARCHAR(50),
    roof_style_type VARCHAR(50),
    sewer_type VARCHAR(50),
    stories VARCHAR(50),
    units_count INTEGER,
    water_type VARCHAR(50),
    living_area_sqft INTEGER,
    ac_description VARCHAR(100),
    garage_description VARCHAR(100),
    building_class_description VARCHAR(100),
    sqft_description VARCHAR(100)
);

CREATE INDEX idx_structures_property_id ON structures(property_id);
CREATE INDEX idx_structures_year_built ON structures(year_built);
CREATE INDEX idx_structures_beds_baths ON structures(beds_count, baths);

COMMENT ON TABLE structures IS 'Building and structure characteristics';

-- Tax information
CREATE TABLE tax_records (
    tax_records_id SERIAL PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    tax_amount DECIMAL(15, 2),
    tax_delinquent_year INTEGER,
    tax_rate_code_area VARCHAR(50),
    UNIQUE(property_id, tax_year)
);

CREATE INDEX idx_tax_records_property_id ON tax_records(property_id);
CREATE INDEX idx_tax_records_year ON tax_records(tax_year);

COMMENT ON TABLE tax_records IS 'Property tax information by year';

-- Valuation history
CREATE TABLE valuations (
    valuations_id SERIAL PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    value DECIMAL(15, 2),
    high DECIMAL(15, 2),
    low DECIMAL(15, 2),
    forecast_standard_deviation DECIMAL(18, 15),
    valuation_date DATE,
    UNIQUE(property_id, valuation_date)
);

CREATE INDEX idx_valuations_property_id ON valuations(property_id);
CREATE INDEX idx_valuations_date ON valuations(valuation_date);

COMMENT ON TABLE valuations IS 'Property valuation history';

-- Pre-foreclosure information
CREATE TABLE pre_foreclosures (
    pre_foreclosures_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    flag BOOLEAN,
    ind VARCHAR(50),
    reason TEXT,
    doc_type VARCHAR(100),
    recording_date DATE
);

CREATE INDEX idx_pre_foreclosures_property_id ON pre_foreclosures(property_id);
CREATE INDEX idx_pre_foreclosures_flag ON pre_foreclosures(flag);

COMMENT ON TABLE pre_foreclosures IS 'Pre-foreclosure status information';

-- Last sale information
CREATE TABLE last_sales (
    last_sales_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    sale_date DATE,
    price DECIMAL(15, 2),
    document_type VARCHAR(100),
    mtg_amount DECIMAL(15, 2),
    mtg_type VARCHAR(100),
    lender VARCHAR(200),
    mtg_interest_rate VARCHAR(20),
    mtg_term_months VARCHAR(10)
);

CREATE INDEX idx_last_sales_property_id ON last_sales(property_id);
CREATE INDEX idx_last_sales_date ON last_sales(sale_date);
CREATE INDEX idx_last_sales_mtg_type ON last_sales(mtg_type);

COMMENT ON TABLE last_sales IS 'Most recent sale transaction details';
COMMENT ON COLUMN last_sales.mtg_type IS 'Mortgage type - Construction/Building Loan indicates active flip, New Conventional indicates sale to homeowner';

-- Current sale information
CREATE TABLE current_sales (
    current_sales_id SERIAL PRIMARY KEY,
    property_id UUID UNIQUE NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    doc_num VARCHAR(50),
    buyer_1 VARCHAR(200),
    buyer_2 VARCHAR(200),
    seller_1 VARCHAR(200),
    seller_2 VARCHAR(200)
);

CREATE INDEX idx_current_sales_property_id ON current_sales(property_id);
CREATE INDEX idx_current_sales_seller ON current_sales(seller_1);
CREATE INDEX idx_current_sales_buyer ON current_sales(buyer_1);

COMMENT ON TABLE current_sales IS 'Current/most recent sale buyer and seller information';

-- Street View image cache table
CREATE TABLE streetview_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '600x400',
    image_data BYTEA,
    content_type TEXT DEFAULT 'image/jpeg',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    expires_at TIMESTAMP NOT NULL,
    metadata_status TEXT
);

CREATE INDEX idx_streetview_cache_property_id ON streetview_cache(property_id);
CREATE INDEX idx_streetview_cache_expires_at ON streetview_cache(expires_at);
CREATE INDEX idx_streetview_cache_property_lookup ON streetview_cache(property_id, expires_at);
CREATE INDEX idx_streetview_cache_address ON streetview_cache(lower(TRIM(BOTH FROM address)));
CREATE INDEX idx_streetview_cache_city ON streetview_cache(lower(TRIM(BOTH FROM city)));
CREATE INDEX idx_streetview_cache_state ON streetview_cache(lower(TRIM(BOTH FROM state)));
CREATE INDEX idx_streetview_cache_size ON streetview_cache(TRIM(BOTH FROM size));
CREATE INDEX idx_streetview_cache_lookup ON streetview_cache(
    lower(TRIM(BOTH FROM address)), 
    lower(TRIM(BOTH FROM city)), 
    lower(TRIM(BOTH FROM state)), 
    TRIM(BOTH FROM size), 
    expires_at
);

COMMENT ON TABLE streetview_cache IS 'Cached Google Street View images for properties with expiration tracking';

-- ============================================================================
-- PROPERTY TRANSACTION HISTORY TABLE (CRITICAL FOR FLIP TRACKING)
-- ============================================================================

CREATE TABLE property_transactions (
    property_transactions_id SERIAL PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    sale_price DECIMAL(15, 2),
    mtg_type VARCHAR(100),
    mtg_amount DECIMAL(15, 2),
    buyer_name VARCHAR(200),
    seller_name VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_property ON property_transactions(property_id);
CREATE INDEX idx_transactions_company ON property_transactions(company_id);
CREATE INDEX idx_transactions_type ON property_transactions(transaction_type);
CREATE INDEX idx_transactions_date ON property_transactions(transaction_date);
CREATE INDEX idx_transactions_property_company ON property_transactions(property_id, company_id);

COMMENT ON TABLE property_transactions IS 'Complete history of property acquisitions and sales by companies - enables flip tracking';
COMMENT ON COLUMN property_transactions.transaction_type IS 'acquisition = company bought property, sale = company sold property';
COMMENT ON COLUMN property_transactions.company_id IS 'The company that performed this transaction';
COMMENT ON COLUMN property_transactions.buyer_name IS 'Name of buyer from current_sale data';
COMMENT ON COLUMN property_transactions.seller_name IS 'Name of seller from current_sale data';

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- Complete property details view
CREATE VIEW property_full_details AS
SELECT 
    p.*,
    c.company_name,
    c.contact_name as company_contact,
    c.contact_email as company_email,
    a.formatted_street_address,
    a.city,
    a.state,
    a.zip_code,
    a.latitude,
    a.longitude,
    s.total_area_sq_ft,
    s.year_built,
    s.beds_count,
    s.baths,
    s.condition,
    ass.assessed_value,
    ass.market_value,
    v.value as current_valuation,
    ls.sale_date as last_sale_date,
    ls.price as last_sale_price,
    ls.mtg_type as last_sale_mtg_type,
    cs.seller_1,
    cs.buyer_1
FROM properties p
LEFT JOIN companies c ON p.company_id = c.id
LEFT JOIN addresses a ON p.id = a.property_id
LEFT JOIN structures s ON p.id = s.property_id
LEFT JOIN assessments ass ON p.id = ass.property_id
LEFT JOIN valuations v ON p.id = v.property_id
LEFT JOIN last_sales ls ON p.id = ls.property_id
LEFT JOIN current_sales cs ON p.id = cs.property_id;

COMMENT ON VIEW property_full_details IS 'Denormalized view of complete property information for easy querying';

-- Active flips view (properties currently being renovated)
CREATE VIEW active_flips AS
SELECT 
    p.id,
    p.sfr_property_id,
    c.company_name,
    a.formatted_street_address,
    a.city,
    a.state,
    a.latitude,
    a.longitude,
    p.status,
    ls.sale_date as acquisition_date,
    ls.price as acquisition_price,
    ls.mtg_type,
    s.beds_count,
    s.baths,
    s.total_area_sq_ft,
    CURRENT_DATE - ls.sale_date as days_in_possession
FROM properties p
JOIN companies c ON p.company_id = c.id
JOIN addresses a ON p.id = a.property_id
LEFT JOIN structures s ON p.id = s.property_id
LEFT JOIN last_sales ls ON p.id = ls.property_id
WHERE p.status IN ('in-renovation', 'on-market')
  AND p.company_id IS NOT NULL;

COMMENT ON VIEW active_flips IS 'Properties currently being flipped by companies';

-- Completed flips view (properties that were sold)
CREATE VIEW completed_flips AS
SELECT 
    pt_buy.property_id,
    p.sfr_property_id,
    c.company_name as flipper_company,
    a.formatted_street_address,
    a.city,
    a.state,
    pt_buy.sale_price as buy_price,
    pt_buy.transaction_date as buy_date,
    pt_sell.sale_price as sell_price,
    pt_sell.transaction_date as sell_date,
    (pt_sell.sale_price - pt_buy.sale_price) as gross_profit,
    ROUND(((pt_sell.sale_price - pt_buy.sale_price) / pt_buy.sale_price * 100)::numeric, 2) as profit_percentage,
    (pt_sell.transaction_date - pt_buy.transaction_date) as days_to_flip,
    pt_sell.buyer_name as sold_to,
    s.beds_count,
    s.baths,
    s.total_area_sq_ft
FROM property_transactions pt_buy
JOIN property_transactions pt_sell 
    ON pt_buy.property_id = pt_sell.property_id
    AND pt_sell.transaction_type = 'sale'
    AND pt_buy.company_id = pt_sell.company_id
JOIN properties p ON pt_buy.property_id = p.id
JOIN companies c ON pt_buy.company_id = c.id
JOIN addresses a ON pt_buy.property_id = a.property_id
LEFT JOIN structures s ON pt_buy.property_id = s.property_id
WHERE pt_buy.transaction_type = 'acquisition'
ORDER BY pt_sell.transaction_date DESC;

COMMENT ON VIEW completed_flips IS 'Analysis of completed property flips with profit calculations';

-- Company performance view
CREATE VIEW company_flip_performance AS
SELECT 
    c.id as company_id,
    c.company_name,
    COUNT(DISTINCT CASE WHEN p.status IN ('in-renovation', 'on-market') THEN p.id END) as active_properties,
    COUNT(DISTINCT CASE WHEN pt.transaction_type = 'sale' THEN pt.property_id END) as completed_flips,
    AVG(CASE WHEN pt_sell.transaction_type = 'sale' 
        THEN pt_sell.sale_price - pt_buy.sale_price END) as avg_profit_per_flip,
    AVG(CASE WHEN pt_sell.transaction_type = 'sale' 
        THEN pt_sell.transaction_date - pt_buy.transaction_date END) as avg_days_to_flip,
    SUM(CASE WHEN pt_sell.transaction_type = 'sale' 
        THEN pt_sell.sale_price - pt_buy.sale_price END) as total_profit,
    MAX(pt_sell.transaction_date) as last_flip_date
FROM companies c
LEFT JOIN properties p ON c.id = p.company_id
LEFT JOIN property_transactions pt ON c.id = pt.company_id
LEFT JOIN property_transactions pt_buy 
    ON pt.property_id = pt_buy.property_id 
    AND pt_buy.transaction_type = 'acquisition'
    AND pt_buy.company_id = c.id
LEFT JOIN property_transactions pt_sell 
    ON pt.property_id = pt_sell.property_id 
    AND pt_sell.transaction_type = 'sale'
    AND pt_sell.company_id = c.id
GROUP BY c.id, c.company_name;

COMMENT ON VIEW company_flip_performance IS 'Aggregate performance metrics for each flipping company';

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update the updated_at column on properties table
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update the updated_at column on users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update the updated_at column on companies table
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get company's active properties
CREATE OR REPLACE FUNCTION get_company_active_properties(company_uuid UUID)
RETURNS TABLE (
    property_id UUID,
    sfr_property_id BIGINT,
    address TEXT,
    city TEXT,
    state TEXT,
    status VARCHAR,
    acquisition_date DATE,
    acquisition_price DECIMAL,
    days_owned INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.sfr_property_id,
        a.formatted_street_address,
        a.city,
        a.state,
        p.status,
        ls.sale_date,
        ls.price,
        CURRENT_DATE - ls.sale_date
    FROM properties p
    JOIN addresses a ON p.id = a.property_id
    LEFT JOIN last_sales ls ON p.id = ls.property_id
    WHERE p.company_id = company_uuid
      AND p.status IN ('in-renovation', 'on-market')
    ORDER BY ls.sale_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get company's completed flips
CREATE OR REPLACE FUNCTION get_company_completed_flips(company_uuid UUID)
RETURNS TABLE (
    property_id UUID,
    sfr_property_id BIGINT,
    address TEXT,
    city TEXT,
    state TEXT,
    buy_price DECIMAL,
    sell_price DECIMAL,
    profit DECIMAL,
    buy_date DATE,
    sell_date DATE,
    days_to_flip INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pt_buy.property_id,
        p.sfr_property_id,
        a.formatted_street_address,
        a.city,
        a.state,
        pt_buy.sale_price,
        pt_sell.sale_price,
        pt_sell.sale_price - pt_buy.sale_price,
        pt_buy.transaction_date,
        pt_sell.transaction_date,
        pt_sell.transaction_date - pt_buy.transaction_date
    FROM property_transactions pt_buy
    JOIN property_transactions pt_sell 
        ON pt_buy.property_id = pt_sell.property_id
        AND pt_sell.transaction_type = 'sale'
        AND pt_buy.company_id = pt_sell.company_id
    JOIN properties p ON pt_buy.property_id = p.id
    JOIN addresses a ON pt_buy.property_id = a.property_id
    WHERE pt_buy.company_id = company_uuid
      AND pt_buy.transaction_type = 'acquisition'
    ORDER BY pt_sell.transaction_date DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify all views were created
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify all indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;

-- End of schema