ALTER TABLE properties
ADD COLUMN property_owner_id VARCHAR REFERENCES company_contacts(id);

-- Migrate existing data by matching property_owner to company_name
UPDATE properties p
SET property_owner_id = cc.id
FROM company_contacts cc
WHERE p.property_owner = cc.company_name;

-- Verify the migration (check for any unmatched properties)
SELECT property_owner, COUNT(*) 
FROM properties 
WHERE property_owner_id IS NULL AND property_owner IS NOT NULL
GROUP BY property_owner;


// Drop Owner Info From Properties //

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'properties'
  AND column_name IN (
    'property_owner',
    'company_contact_name',
    'company_contact_email'
  );

ALTER TABLE properties
DROP COLUMN property_owner,
DROP COLUMN company_contact_name,
DROP COLUMN company_contact_email;