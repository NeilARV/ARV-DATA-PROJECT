import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { properties, addresses } from "@database/schemas/properties.schema";
import { eq, ilike, and, sql } from "drizzle-orm";

// ── Static zip-prefix → MSA name for our 6 tracked markets ───────────────────
// Used as a fallback when the property isn't yet in our database.
// Ranges are inclusive; zip codes outside these ranges are not tracked.

function zipToStaticMsaName(zip: string): string | null {
    const z = parseInt(zip.slice(0, 5), 10);
    if (isNaN(z)) return null;

    // California
    if ((z >= 91901 && z <= 91980) || (z >= 92003 && z <= 92199))
        return "San Diego-Chula Vista-Carlsbad, CA";
    if ((z >= 90001 && z <= 91899) || (z >= 92602 && z <= 92899))
        return "Los Angeles-Long Beach-Anaheim, CA";
    // Riverside-San Bernardino-Ontario (Inland Empire) — ranges that don't overlap with SD or LA static ranges above
    if (z >= 92201 && z <= 92599)
        return "Riverside-San Bernardino-Ontario, CA";
    if (
        (z >= 94002 && z <= 94135) ||
        (z >= 94301 && z <= 94309) ||
        (z >= 94401 && z <= 94448) ||
        (z >= 94501 && z <= 94634) ||
        (z >= 94706 && z <= 94960)
    )
        return "San Francisco-Oakland-Fremont, CA";

    // Colorado
    if ((z >= 80001 && z <= 80299) || (z >= 80401 && z <= 80499) || (z >= 80601 && z <= 80839))
        return "Denver-Aurora-Centennial, CO";

    // Florida
    if (z >= 33001 && z <= 33499)
        return "Miami-Fort Lauderdale-West Palm Beach, FL";
    if (z >= 34945 && z <= 34997)
        return "Port St. Lucie, FL";
    if (
        (z >= 33503 && z <= 33694) || // Hillsborough (Tampa, Brandon, Lutz, Plant City)
        (z >= 33700 && z <= 33786) || // Pinellas (St. Petersburg, Clearwater, Largo)
        (z >= 34601 && z <= 34698)    // Hernando (Brooksville, Spring Hill) + Pasco 34xxx (New Port Richey, Wesley Chapel)
    ) return "Tampa-St. Petersburg-Clearwater, FL";

    // Washington
    if (
        (z >= 98001 && z <= 98199) || // King County (Seattle, Bellevue, Kent, Redmond)
        (z >= 98201 && z <= 98296) || // Snohomish County (Everett, Lynnwood, Marysville)
        (z >= 98301 && z <= 98580)    // Pierce County (Tacoma, Puyallup, Lakewood)
    ) return "Seattle-Tacoma-Bellevue, WA";

    return null;
}

/**
 * Resolves the internal msas.id for a given city/state/zip combination.
 *
 * Resolution order:
 *  1. DB lookup by zip code  (join addresses → properties.msa → msas)
 *  2. DB lookup by city + state
 *  3. Static zip-prefix map for our 6 tracked MSAs
 *
 * Returns null when the location cannot be matched to a tracked MSA.
 */
export async function resolveMsaId(
    city: string,
    state: string,
    zipCode?: string | null
): Promise<number | null> {
    const msaJoin = sql`lower(trim(${properties.msa})) = lower(trim(${msas.name}))`;

    // ── Tier 1: zip code match ────────────────────────────────────────────────
    const cleanZip = zipCode?.trim();
    if (cleanZip) {
        const [row] = await db
            .select({ id: msas.id })
            .from(msas)
            .innerJoin(properties, msaJoin)
            .innerJoin(addresses, eq(addresses.propertyId, properties.id))
            .where(eq(addresses.zipCode, cleanZip))
            .limit(1);
        if (row) return row.id;
    }

    // ── Tier 2: city + state match ────────────────────────────────────────────
    const [row] = await db
        .select({ id: msas.id })
        .from(msas)
        .innerJoin(properties, msaJoin)
        .innerJoin(addresses, eq(addresses.propertyId, properties.id))
        .where(and(ilike(addresses.city, city.trim()), ilike(addresses.state, state.trim())))
        .limit(1);
    if (row) return row.id;

    // ── Tier 3: static zip-prefix fallback ───────────────────────────────────
    const staticMsaName = cleanZip ? zipToStaticMsaName(cleanZip) : null;
    if (staticMsaName) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, staticMsaName))
            .limit(1);
        if (msaRow) return msaRow.id;
    }

    return null;
}
