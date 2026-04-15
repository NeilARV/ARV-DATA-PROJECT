-- Find a way to keep all inputs unique for a company

-- Company contacts table relates to companies and users (many-to-many relationship)
CREATE TABLE company_contacts (
    id           SERIAL       PRIMARY KEY,
    company_id   UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
    first_name   TEXT         NOT NULL,
    last_name    TEXT,
    email        TEXT,
    phone_number VARCHAR(20),
    title        TEXT,
    sort_order   INTEGER      NOT NULL DEFAULT 1,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT now()
);

-- last_name and title are nullable so a standard unique constraint won't catch NULLs as equal.
-- COALESCE treats NULL as '' so duplicate rows with missing fields are still blocked.
CREATE UNIQUE INDEX uq_company_contacts
    ON company_contacts (company_id, first_name, COALESCE(last_name, ''), COALESCE(title, ''));

-- Company counties table relates to companies and counties (many-to-many relationship)
CREATE TABLE company_counties (
    company_id UUID NOT NULL references companies(id) ON DELETE CASCADE,
    county TEXT NOT NULL,
    state VARCHAR(2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (company_id, county, state)
);

-- Migrate contacts: split contact_name into first_name / last_name on the first space
INSERT INTO company_contacts (company_id, first_name, last_name, email, phone_number)
SELECT
    id,
    SPLIT_PART(contact_name, ' ', 1)                                           AS first_name,
    NULLIF(SUBSTRING(contact_name FROM POSITION(' ' IN contact_name) + 1), '') AS last_name,
    contact_email,
    phone_number
FROM companies
WHERE contact_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate counties: expand plain string JSON array from companies.counties into company_counties
-- Looks up state from known county→state mapping (all counties are unique across our MSAs)
WITH county_state_map (county, state) AS (
    VALUES
        ('San Diego',      'CA'),
        ('Orange',         'CA'),
        ('Los Angeles',    'CA'),
        ('San Francisco',  'CA'),
        ('Alameda',        'CA'),
        ('Contra Costa',   'CA'),
        ('Marin',          'CA'),
        ('San Mateo',      'CA'),
        ('Denver',         'CO'),
        ('Adams',          'CO'),
        ('Arapahoe',       'CO'),
        ('Broomfield',     'CO'),
        ('Jefferson',      'CO'),
        ('Douglas',        'CO'),
        ('Clear Creek',    'CO'),
        ('Gilpin',         'CO'),
        ('Elbert',         'CO'),
        ('Park',           'CO'),
        ('Miami-Dade',     'FL'),
        ('Broward',        'FL'),
        ('Palm Beach',     'FL'),
        ('St. Lucie',      'FL'),
        ('Martin',         'FL'),
        ('King',           'WA'),
        ('Pierce',         'WA'),
        ('Snohomish',      'WA')
)
INSERT INTO company_counties (company_id, county, state)
SELECT
    c.id,
    m.county,
    m.state
FROM companies c,
     json_array_elements_text(c.counties) AS county_name
JOIN county_state_map m ON m.county = county_name
WHERE c.counties IS NOT NULL
  AND c.counties::text <> 'null'
  AND json_array_length(c.counties) > 0
ON CONFLICT (company_id, county, state) DO NOTHING;

-- Alter companies table | Run after creating new tables and migrating data
ALTER TABLE companies RENAME COLUMN company_name TO company;
ALTER TABLE companies DROP COLUMN IF EXISTS contact_name;
ALTER TABLE companies DROP COLUMN IF EXISTS contact_email;
ALTER TABLE companies DROP COLUMN IF EXISTS phone_number;
ALTER TABLE companies DROP COLUMN IF EXISTS counties;
