/**
 * Maps every tracked county name to its MSA string (as stored in the msas table).
 * Single source of truth used by both client (county.ts) and server (countyToMsa.ts).
 * County names must match exactly — casing and punctuation matter.
 */
export const COUNTY_TO_MSA: Record<string, string> = {
    // San Diego MSA (CA)
    "San Diego":     "San Diego-Chula Vista-Carlsbad, CA",

    // Los Angeles MSA (CA)
    "Los Angeles":   "Los Angeles-Long Beach-Anaheim, CA",
    "Orange":        "Los Angeles-Long Beach-Anaheim, CA",

    // Denver MSA (CO)
    "Denver":        "Denver-Aurora-Centennial, CO",
    "Adams":         "Denver-Aurora-Centennial, CO",
    "Arapahoe":      "Denver-Aurora-Centennial, CO",
    "Broomfield":    "Denver-Aurora-Centennial, CO",
    "Jefferson":     "Denver-Aurora-Centennial, CO",
    "Douglas":       "Denver-Aurora-Centennial, CO",
    "Clear Creek":   "Denver-Aurora-Centennial, CO",
    "Gilpin":        "Denver-Aurora-Centennial, CO",
    "Elbert":        "Denver-Aurora-Centennial, CO",
    "Park":          "Denver-Aurora-Centennial, CO",

    // San Francisco MSA (CA)
    "San Francisco": "San Francisco-Oakland-Fremont, CA",
    "Alameda":       "San Francisco-Oakland-Fremont, CA",
    "Contra Costa":  "San Francisco-Oakland-Fremont, CA",
    "Marin":         "San Francisco-Oakland-Fremont, CA",
    "San Mateo":     "San Francisco-Oakland-Fremont, CA",

    // Miami MSA (FL)
    "Miami-Dade":    "Miami-Fort Lauderdale-West Palm Beach, FL",
    "Broward":       "Miami-Fort Lauderdale-West Palm Beach, FL",
    "Palm Beach":    "Miami-Fort Lauderdale-West Palm Beach, FL",

    // Port St. Lucie MSA (FL)
    "St. Lucie":     "Port St. Lucie, FL",
    "Martin":        "Port St. Lucie, FL",

    // Seattle MSA (WA)
    "King":          "Seattle-Tacoma-Bellevue, WA",
    "Pierce":        "Seattle-Tacoma-Bellevue, WA",
    "Snohomish":     "Seattle-Tacoma-Bellevue, WA",

    // Tampa MSA (FL)
    "Hillsborough":  "Tampa-St. Petersburg-Clearwater, FL",
    "Pinellas":      "Tampa-St. Petersburg-Clearwater, FL",
    "Pasco":         "Tampa-St. Petersburg-Clearwater, FL",
    "Hernando":      "Tampa-St. Petersburg-Clearwater, FL",
};

/** Returns the MSA name for a given county, or undefined if not tracked. */
export function getMsaNameFromCounty(county: string): string | undefined {
    return COUNTY_TO_MSA[county];
}
