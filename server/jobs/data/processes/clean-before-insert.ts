import { normalizeCountyName, normalizePropertyType } from "server/utils/normalization";
import type { PropertyWithStatus } from "./resolve-status";

/**
 * Last-mile cleanup before DB insert. Normalizes fields that must match app
 * conventions (e.g. county as "Los Angeles" not "Los Angeles County",
 * property_type to canonical values like "Single Family", "Condo").
 */
export function cleanBeforeInsert(
  properties: PropertyWithStatus[]
): PropertyWithStatus[] {
  return properties.map((item) => {
    const property = { ...item.property } as Record<string, unknown>;
    const county = property.county as string | null | undefined;
    property.county = normalizeCountyName(county) ?? county ?? null;

    const propertyType = property.property_type as string | null | undefined;
    property.property_type = normalizePropertyType(propertyType) ?? propertyType ?? null;

    const address = property.address as Record<string, unknown> | undefined;
    if (address && typeof address === "object") {
      const addr = { ...address };
      const addrCounty = addr.county as string | null | undefined;
      addr.county = normalizeCountyName(addrCounty) ?? addrCounty ?? null;
      property.address = addr;
    }

    return {
      ...item,
      property: property as PropertyWithStatus["property"],
    };
  });
}
