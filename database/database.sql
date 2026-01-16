-- PostgreSQL Database Schema for Property Data
-- This schema is designed to normalize the property data structure while maintaining data integrity

-- Main property table
CREATE TABLE properties (
    property_id BIGINT PRIMARY KEY,
    property_class_description VARCHAR(100),
    property_type VARCHAR(100),
    vacant BOOLEAN,
    hoa VARCHAR(10),
    owner_type VARCHAR(50),
    purchase_method VARCHAR(50),
    listing_status VARCHAR(50),
    months_owned INTEGER,
    msa VARCHAR(200),
    county VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Address information
CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
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

-- Assessments
CREATE TABLE assessments (
    assessment_id SERIAL PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    assessed_year INTEGER NOT NULL,
    land_value DECIMAL(15, 2),
    improvement_value DECIMAL(15, 2),
    assessed_value DECIMAL(15, 2),
    market_value DECIMAL(15, 2),
    UNIQUE(property_id, assessed_year)
);

CREATE INDEX idx_assessments_property_id ON assessments(property_id);
CREATE INDEX idx_assessments_year ON assessments(assessed_year);

-- Exemptions
CREATE TABLE exemptions (
    exemption_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
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

-- Owner information
CREATE TABLE owners (
    owner_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    owner_occupied BOOLEAN,
    name VARCHAR(200),
    second_name VARCHAR(200),
    formatted_street_address VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(2),
    zip_code VARCHAR(10),
    zip_plus_four_code VARCHAR(10),
    corporate_owner BOOLEAN,
    care_of_name VARCHAR(200)
);

CREATE INDEX idx_owners_property_id ON owners(property_id);
CREATE INDEX idx_owners_name ON owners(name);

-- Parcel information
CREATE TABLE parcels (
    parcel_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
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

-- School districts
CREATE TABLE school_districts (
    school_district_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    school_tax_district_1 VARCHAR(100),
    school_tax_district_2 VARCHAR(100),
    school_tax_district_3 VARCHAR(100),
    school_district_name VARCHAR(200)
);

CREATE INDEX idx_school_districts_property_id ON school_districts(property_id);

-- Structure/Building information
CREATE TABLE structures (
    structure_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    total_area_sq_ft INTEGER,
    year_built INTEGER,
    effective_year_built INTEGER,
    beds_count INTEGER,
    rooms_count INTEGER,
    baths DECIMAL(3, 1),
    partial_baths_count INTEGER,
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

-- Tax information
CREATE TABLE tax_records (
    tax_record_id SERIAL PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    tax_amount DECIMAL(15, 2),
    tax_delinquent_year INTEGER,
    tax_rate_code_area VARCHAR(50),
    UNIQUE(property_id, tax_year)
);

CREATE INDEX idx_tax_records_property_id ON tax_records(property_id);
CREATE INDEX idx_tax_records_year ON tax_records(tax_year);

-- Valuation history
CREATE TABLE valuations (
    valuation_id SERIAL PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    value DECIMAL(15, 2),
    high DECIMAL(15, 2),
    low DECIMAL(15, 2),
    forecast_standard_deviation DECIMAL(18, 15),
    valuation_date DATE,
    UNIQUE(property_id, valuation_date)
);

CREATE INDEX idx_valuations_property_id ON valuations(property_id);
CREATE INDEX idx_valuations_date ON valuations(valuation_date);

-- Pre-foreclosure information
CREATE TABLE pre_foreclosures (
    pre_foreclosure_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    flag BOOLEAN,
    ind VARCHAR(50),
    reason TEXT,
    doc_type VARCHAR(100),
    recording_date DATE
);

CREATE INDEX idx_pre_foreclosures_property_id ON pre_foreclosures(property_id);
CREATE INDEX idx_pre_foreclosures_flag ON pre_foreclosures(flag);

-- Last sale information
CREATE TABLE last_sales (
    last_sale_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
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

-- Current sale information
CREATE TABLE current_sales (
    current_sale_id SERIAL PRIMARY KEY,
    property_id BIGINT UNIQUE NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    doc_num VARCHAR(50),
    buyer_1 VARCHAR(200),
    buyer_2 VARCHAR(200),
    seller_1 VARCHAR(200),
    seller_2 VARCHAR(200)
);

CREATE INDEX idx_current_sales_property_id ON current_sales(property_id);

-- Street View image cache table
CREATE TABLE streetview_cache (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id BIGINT REFERENCES properties(property_id) ON DELETE CASCADE,
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

-- Create a view for easy querying of complete property information
CREATE VIEW property_full_details AS
SELECT 
    p.*,
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
    o.name as owner_name,
    o.owner_occupied,
    ass.assessed_value,
    ass.market_value,
    v.value as current_valuation,
    ls.sale_date as last_sale_date,
    ls.price as last_sale_price
FROM properties p
LEFT JOIN addresses a ON p.property_id = a.property_id
LEFT JOIN structures s ON p.property_id = s.property_id
LEFT JOIN owners o ON p.property_id = o.property_id
LEFT JOIN assessments ass ON p.property_id = ass.property_id
LEFT JOIN valuations v ON p.property_id = v.property_id
LEFT JOIN last_sales ls ON p.property_id = ls.property_id;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update the updated_at column
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE properties IS 'Main property table containing core property information';
COMMENT ON TABLE addresses IS 'Physical address and location details for properties';
COMMENT ON TABLE assessments IS 'Property assessment values by year';
COMMENT ON TABLE structures IS 'Building and structure characteristics';
COMMENT ON TABLE owners IS 'Property owner information';
COMMENT ON TABLE parcels IS 'Parcel and land information';
COMMENT ON TABLE tax_records IS 'Property tax information by year';
COMMENT ON TABLE valuations IS 'Property valuation history';
COMMENT ON TABLE last_sales IS 'Most recent sale transaction details';
COMMENT ON TABLE current_sales IS 'Current/pending sale information';
COMMENT ON TABLE streetview_cache IS 'Cached Google Street View images for properties with expiration tracking';