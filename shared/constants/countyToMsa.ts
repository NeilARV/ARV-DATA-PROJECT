/**
 * Maps every tracked county name to its MSA string (as stored in the msas table).
 * Single source of truth used by both client (county.ts) and server (countyToMsa.ts).
 * County names must match exactly — casing and punctuation matter.
 */
export const COUNTY_TO_MSA: Record<string, string> = {
    // San Diego MSA (CA)
    'San Diego': 'San Diego-Chula Vista-Carlsbad, CA',

    // Los Angeles MSA (CA)
    'Los Angeles': 'Los Angeles-Long Beach-Anaheim, CA',
    Orange: 'Los Angeles-Long Beach-Anaheim, CA',

    // Riverside-San Bernardino-Ontario MSA (CA)
    Riverside: 'Riverside-San Bernardino-Ontario, CA',
    'San Bernardino': 'Riverside-San Bernardino-Ontario, CA',

    // Denver MSA (CO)
    Denver: 'Denver-Aurora-Centennial, CO',
    Adams: 'Denver-Aurora-Centennial, CO',
    Arapahoe: 'Denver-Aurora-Centennial, CO',
    Broomfield: 'Denver-Aurora-Centennial, CO',
    Jefferson: 'Denver-Aurora-Centennial, CO',
    Douglas: 'Denver-Aurora-Centennial, CO',
    'Clear Creek': 'Denver-Aurora-Centennial, CO',
    Gilpin: 'Denver-Aurora-Centennial, CO',
    Elbert: 'Denver-Aurora-Centennial, CO',
    Park: 'Denver-Aurora-Centennial, CO',

    // San Francisco MSA (CA)
    'San Francisco': 'San Francisco-Oakland-Fremont, CA',
    Alameda: 'San Francisco-Oakland-Fremont, CA',
    'Contra Costa': 'San Francisco-Oakland-Fremont, CA',
    Marin: 'San Francisco-Oakland-Fremont, CA',
    'San Mateo': 'San Francisco-Oakland-Fremont, CA',

    // Miami MSA (FL)
    'Miami-Dade': 'Miami-Fort Lauderdale-West Palm Beach, FL',
    Broward: 'Miami-Fort Lauderdale-West Palm Beach, FL',
    'Palm Beach': 'Miami-Fort Lauderdale-West Palm Beach, FL',

    // Port St. Lucie MSA (FL)
    'St. Lucie': 'Port St. Lucie, FL',
    Martin: 'Port St. Lucie, FL',

    // Seattle MSA (WA)
    King: 'Seattle-Tacoma-Bellevue, WA',
    Pierce: 'Seattle-Tacoma-Bellevue, WA',
    Snohomish: 'Seattle-Tacoma-Bellevue, WA',

    // Tampa MSA (FL)
    Hillsborough: 'Tampa-St. Petersburg-Clearwater, FL',
    Pinellas: 'Tampa-St. Petersburg-Clearwater, FL',
    Pasco: 'Tampa-St. Petersburg-Clearwater, FL',
    Hernando: 'Tampa-St. Petersburg-Clearwater, FL',
};

/** Returns the MSA name for a given county, or undefined if not tracked. */
export function getMsaNameFromCounty(county: string): string | undefined {
    return COUNTY_TO_MSA[county];
}

/** Returns the MSA name for a county, or null if the county is not tracked. */
export function getMsaForCounty(county: string): string | null {
    return COUNTY_TO_MSA[county] ?? null;
}

/** Returns the county names belonging to an MSA, in map order (empty if the MSA is not tracked). */
export function getCountiesForMsa(msaName: string): string[] {
    return Object.entries(COUNTY_TO_MSA)
        .filter(([, msa]) => msa === msaName)
        .map(([county]) => county);
}

/** Two-letter state code parsed from an MSA name's trailing ", XX"; null if absent. */
export function getStateFromMsaName(msaName: string): string | null {
    return msaName.match(/,\s*([A-Z]{2})$/)?.[1] ?? null;
}

/**
 * The full tracked `(county, state)` universe, derived from `COUNTY_TO_MSA` alone.
 * State is taken from the MSA name's trailing code, so there is no second source of truth.
 */
export function getTrackedCounties(): { county: string; state: string; msaName: string }[] {
    return Object.entries(COUNTY_TO_MSA).map(([county, msaName]) => ({
        county,
        state: getStateFromMsaName(msaName) ?? '',
        msaName,
    }));
}

/** The tracked MSAs with their two-letter states, each once, in map-encounter order. */
export function getTrackedMsas(): { msaName: string; state: string }[] {
    const seen = new Set<string>();
    const msas: { msaName: string; state: string }[] = [];
    for (const msaName of Object.values(COUNTY_TO_MSA)) {
        if (seen.has(msaName)) continue;
        seen.add(msaName);
        msas.push({ msaName, state: getStateFromMsaName(msaName) ?? '' });
    }
    return msas;
}

/**
 * The subset of `counties` that belong to the MSA, matched case-insensitively.
 * @returns canonical-cased county names, deduped, in `COUNTY_TO_MSA` map order
 */
export function filterCountiesToMsa(msaName: string, counties: string[]): string[] {
    const requested = new Set(counties.map((county) => county.trim().toLowerCase()));
    return getCountiesForMsa(msaName).filter((county) => requested.has(county.toLowerCase()));
}
