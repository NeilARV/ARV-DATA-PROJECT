/**
 * Maps the exact MSA name (as stored in the msas table) to its 2-letter state abbreviation.
 * Used as a reliable fallback when the SFR API omits or renames the state field.
 */
export const MSA_STATE: Record<string, string> = {
    "Denver-Aurora-Centennial, CO":              "CO",
    "Los Angeles-Long Beach-Anaheim, CA":        "CA",
    "Miami-Fort Lauderdale-West Palm Beach, FL": "FL",
    "Port St. Lucie, FL":                        "FL",
    "Riverside-San Bernardino-Ontario, CA":      "CA",
    "San Diego-Chula Vista-Carlsbad, CA":        "CA",
    "San Francisco-Oakland-Fremont, CA":         "CA",
    "Seattle-Tacoma-Bellevue, WA":               "WA",
    "Tampa-St. Petersburg-Clearwater, FL":       "FL",
};
