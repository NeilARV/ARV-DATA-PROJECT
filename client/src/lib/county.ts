import {
  COUNTIES,
  SAN_DIEGO_MSA_ZIP_CODES,
  LOS_ANGELES_MSA_ZIP_CODES,
  DENVER_MSA_ZIP_CODES,
  SAN_FRANCISCO_MSA_ZIP_CODES,
  MIAMI_MSA_ZIP_CODES,
  PORT_ST_LUCIE_MSA_ZIP_CODES,
  SEATTLE_MSA_ZIP_CODES,
} from "@/constants/filters.constants";

/** Default map center when county is not found (San Diego coordinates). */
const DEFAULT_MAP_CENTER: [number, number] = [32.7157, -117.1611];

/**
 * Returns the center coordinates for a county from the COUNTIES array.
 */
export function getCountyCenter(countyName: string): [number, number] | undefined {
  const county = COUNTIES.find((c) => c.county === countyName);
  return county?.center as [number, number] | undefined;
}

/**
 * Returns the state code for a county from the COUNTIES array.
 */
export function getStateFromCounty(countyName: string): string {
  const county = COUNTIES.find((c) => c.county === countyName);
  return county?.state ?? "CA";
}

/**
 * Converts county name to object key format (e.g. "San Diego" -> "san_diego",
 * "Miami-Dade" -> "miami_dade", "St. Lucie" -> "st_lucie").
 */
export function countyNameToKey(countyName: string): string {
  return countyName
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

/**
 * Returns the default map center (San Diego), or fallback coordinates if not found.
 */
export function getDefaultMapCenter(): [number, number] {
  return getCountyCenter("San Diego") ?? DEFAULT_MAP_CENTER;
}

const COUNTY_TO_MSA: Record<string, string> = {
  "San Diego": "San Diego-Chula Vista-Carlsbad, CA",
  "Los Angeles": "Los Angeles-Long Beach-Anaheim, CA",
  "Orange": "Los Angeles-Long Beach-Anaheim, CA",
  "Denver": "Denver-Aurora-Centennial, CO",
  "Adams": "Denver-Aurora-Centennial, CO",
  "Arapahoe": "Denver-Aurora-Centennial, CO",
  "Broomfield": "Denver-Aurora-Centennial, CO",
  "Jefferson": "Denver-Aurora-Centennial, CO",
  "Douglas": "Denver-Aurora-Centennial, CO",
  "Clear Creek": "Denver-Aurora-Centennial, CO",
  "Gilpin": "Denver-Aurora-Centennial, CO",
  "Elbert": "Denver-Aurora-Centennial, CO",
  "Park": "Denver-Aurora-Centennial, CO",
  "San Francisco": "San Francisco-Oakland-Fremont, CA",
  "Alameda": "San Francisco-Oakland-Fremont, CA",
  "Contra Costa": "San Francisco-Oakland-Fremont, CA",
  "Marin": "San Francisco-Oakland-Fremont, CA",
  "San Mateo": "San Francisco-Oakland-Fremont, CA",
  "Miami-Dade": "Miami-Fort Lauderdale-West Palm Beach, FL",
  "Broward": "Miami-Fort Lauderdale-West Palm Beach, FL",
  "Palm Beach": "Miami-Fort Lauderdale-West Palm Beach, FL",
  "St. Lucie": "Port St. Lucie, FL",
  "Martin": "Port St. Lucie, FL",
  "King": "Seattle-Tacoma-Bellevue, WA",
  "Pierce": "Seattle-Tacoma-Bellevue, WA",
  "Snohomish": "Seattle-Tacoma-Bellevue, WA",
};

/** Returns the MSA name for a given county, or undefined if not mapped. */
export function getMsaNameFromCounty(countyName: string): string | undefined {
  return COUNTY_TO_MSA[countyName];
}

/**
 * Returns the zip code list for a given county, keyed by the MSA zip code maps.
 * Used by FilterHeader and useMap to derive available zip codes for filtering.
 */
export function getZipCodesForCounty(countyName: string): { zip: string; city: string }[] {
  const state = getStateFromCounty(countyName);
  const countyKey = countyNameToKey(countyName);

  let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
  if (state === "CA") {
    msaZipCodes =
      countyName === "Los Angeles" || countyName === "Orange"
        ? LOS_ANGELES_MSA_ZIP_CODES
        : countyName === "San Francisco" || countyName === "Alameda" || countyName === "Contra Costa" || countyName === "Marin" || countyName === "San Mateo"
          ? SAN_FRANCISCO_MSA_ZIP_CODES
          : SAN_DIEGO_MSA_ZIP_CODES;
  } else if (state === "CO") {
    msaZipCodes = DENVER_MSA_ZIP_CODES;
  } else if (state === "FL") {
    msaZipCodes =
      countyName === "St. Lucie" || countyName === "Martin"
        ? PORT_ST_LUCIE_MSA_ZIP_CODES
        : MIAMI_MSA_ZIP_CODES;
  } else if (state === "WA") {
    msaZipCodes = SEATTLE_MSA_ZIP_CODES;
  } else {
    msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
  }

  const list = msaZipCodes[countyKey] ?? [];
  return Array.isArray(list) ? list : [];
}
