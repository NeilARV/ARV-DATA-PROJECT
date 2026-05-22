import { db } from "server/storage";
import { addresses } from "@database/schemas/properties.schema";
import { eq, ilike, and, isNotNull } from "drizzle-orm";

/**
 * Resolves a county name from a deal's zip code by looking up existing address
 * records in the database. Falls back to city+state lookup if zip yields nothing.
 * Returns null when the location is not yet in our property dataset.
 */
export async function resolveCountyFromZip(
    zipCode: string,
    city?: string,
    state?: string,
): Promise<string | null> {
    // Tier 1: zip code match (most precise)
    const cleanZip = zipCode.trim();
    if (cleanZip) {
        const [row] = await db
            .select({ county: addresses.county })
            .from(addresses)
            .where(and(eq(addresses.zipCode, cleanZip), isNotNull(addresses.county)))
            .limit(1);
        if (row?.county) return row.county;
    }

    // Tier 2: city + state match (fallback when zip not yet in dataset)
    if (city && state) {
        const [row] = await db
            .select({ county: addresses.county })
            .from(addresses)
            .where(and(
                ilike(addresses.city, city.trim()),
                ilike(addresses.state, state.trim()),
                isNotNull(addresses.county),
            ))
            .limit(1);
        if (row?.county) return row.county;
    }

    return null;
}
