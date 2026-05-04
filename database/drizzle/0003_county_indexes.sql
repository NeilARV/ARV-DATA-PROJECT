CREATE INDEX IF NOT EXISTS "idx_properties_county_lower" ON "properties" (lower(trim("county")));
-->statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_addresses_county_lower" ON "addresses" (lower(trim("county")));
