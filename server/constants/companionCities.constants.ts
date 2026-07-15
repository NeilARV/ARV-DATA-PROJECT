// Boundary cities that physically sit in one county but whose deals are sold to a neighboring
// MSA's audience — Temecula/Murrieta are in Riverside County, but the business announces those
// deals to the San Diego market. Key: "city|state" (lowercase). Single source consumed by both
// create-time MSA resolution (resolveMsaId) and the deal-notification fan-out
// (resolveDealRecipients); add one entry here to onboard a new companion city.
export const COMPANION_CITY_MSA: Record<string, string> = {
    'temecula|ca': 'San Diego-Chula Vista-Carlsbad, CA',
    'murrieta|ca': 'San Diego-Chula Vista-Carlsbad, CA',
};

/** Companion MSA name for a boundary city, or null when the city has no companion market. */
export function getCompanionMsaName(city?: string | null, state?: string | null): string | null {
    if (!city || !state) return null;
    return COMPANION_CITY_MSA[`${city.trim().toLowerCase()}|${state.trim().toLowerCase()}`] ?? null;
}
