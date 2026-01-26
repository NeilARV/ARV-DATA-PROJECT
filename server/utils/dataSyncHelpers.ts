import { db } from "server/storage";
import { companies } from "../../database/schemas/companies.schema";
import { sfrSyncState as sfrSyncStateV2 } from "../../database/schemas/sync.schema";
import { eq, sql } from "drizzle-orm";
import { normalizeDateToYMD } from "server/utils/normalization";

// Helper to parse counties from DB (handles both array and legacy string format)
function parseCountiesArray(counties: any): string[] {
    if (!counties) return [];
    if (Array.isArray(counties)) return counties;
    if (typeof counties === 'string') {
        try {
            return JSON.parse(counties);
        } catch {
            return [];
        }
    }
    return [];
}

// Helper function to check if a name/entity is a trust
function isTrust(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
    if (!name) return false;
    
    // Ownership codes that indicate trusts
    const trustCodes = ['TR', 'FL']; // TR = Trust, FL = Family Living Trust
    
    if (ownershipCode && trustCodes.includes(ownershipCode.toUpperCase())) {
        return true;
    }
    
    // Name-based detection
    const trustPatterns = [
        /\bTRUST\b/i,
        /\bLIVING TRUST\b/i,
        /\bFAMILY TRUST\b/i,
        /\bREVOCABLE TRUST\b/i,
        /\bIRREVOCABLE TRUST\b/i,
        /\bSPOUSAL TRUST\b/i
    ];
    
    return trustPatterns.some(pattern => pattern.test(name));
}

// Helper to persist sync state V2 (tracking only lastSaleDate)
export async function persistSyncState(options: {
    syncStateId?: number | null;
    previousLastSaleDate?: string | null;
    initialTotalSynced?: number;
    processed?: number;
    finalSaleDate?: string | null;
    cityCode: string;
}) {
    const {
        syncStateId,
        previousLastSaleDate,
        initialTotalSynced = 0,
        processed = 0,
        finalSaleDate,
        cityCode,
    } = options || {};

    if (!syncStateId) {
        console.warn(`[${cityCode} SYNC] No syncStateId provided to persist state`);
        return { lastSaleDate: previousLastSaleDate || null };
    }

    const newTotalSynced = (initialTotalSynced || 0) + (processed || 0);
    
    // Calculate lastSaleDate
    // Subtract 1 day from the latest sale date because the API range is non-inclusive.
    let saleDateToSet: string | null = null;
    if (finalSaleDate) {
        // New boundary date found - normalize to YYYY-MM-DD and subtract 1 day
        saleDateToSet = normalizeDateToYMD(finalSaleDate, { subtractDays: 1 });
    } else if (previousLastSaleDate) {
        // No new date, keep the previous value
        saleDateToSet = normalizeDateToYMD(previousLastSaleDate);
    }

    try {
        await db
            .update(sfrSyncStateV2)
            .set({
                lastSaleDate: saleDateToSet,
                totalRecordsSynced: newTotalSynced,
                lastSyncAt: sql`now()`,
            })
            .where(eq(sfrSyncStateV2.id, syncStateId));

        console.log(
            `[${cityCode} SYNC] Persisted sync state. lastSaleDate: ${saleDateToSet}, totalRecordsSynced: ${newTotalSynced}`,
        );
        return { lastSaleDate: saleDateToSet };
    } catch (e: any) {
        console.error(`[${cityCode} SYNC] Failed to persist sync state:`, e);
        return { lastSaleDate: saleDateToSet };
    }
}

// Helper function to check if a name/entity is a flipping company (corporate but not trust)
export function isFlippingCompany(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
    if (!name) return false;
    
    // Must NOT be a trust
    if (isTrust(name, ownershipCode)) {
        return false;
    }
    
    // Valid corporate patterns
    const corporatePatterns = [
        /\bLLC\b/i,
        /\bINC\b/i,
        /\bCORP\b/i,
        /\bLTD\b/i,
        /\bLP\b/i,
        /\bPROPERTIES\b/i,
        /\bINVESTMENTS?\b/i,
        /\bCAPITAL\b/i,
        /\bVENTURES?\b/i,
        /\bHOLDINGS?\b/i,
        /\bREALTY\b/i
    ];
    
    return corporatePatterns.some(pattern => pattern.test(name));
}

// Helper to add counties to a company and update DB if needed
export async function addCountiesToCompanyIfNeeded(
    company: typeof companies.$inferSelect,
    countiesToAdd: string[] | Set<string>
): Promise<void> {
    const countiesArray = parseCountiesArray(company.counties);
    const newCounties = Array.isArray(countiesToAdd) ? countiesToAdd : Array.from(countiesToAdd);
    
    const actuallyNew = newCounties.filter(c => 
        !countiesArray.some(existing => existing.toLowerCase() === c.toLowerCase())
    );
    
    if (actuallyNew.length === 0) return;
    
    countiesArray.push(...actuallyNew);
    await db
        .update(companies)
        .set({ counties: countiesArray, updatedAt: new Date() })
        .where(eq(companies.id, company.id));
    company.counties = countiesArray;
}

// Helper to find a company in DB by name, cache it, and optionally update counties
export async function findAndCacheCompany(
    companyStorageName: string,
    normalizedCompareKey: string | null,
    contactsMap: Map<string, typeof companies.$inferSelect>,
    cityCode: string,
    countiesToUpdate?: string[] | Set<string>,
): Promise<typeof companies.$inferSelect | null> {
    try {
        const [dbCompany] = await db
            .select()
            .from(companies)
            .where(eq(companies.companyName, companyStorageName))
            .limit(1);
        
        if (dbCompany) {
            // Add to cache if we have a compare key
            if (normalizedCompareKey) {
                contactsMap.set(normalizedCompareKey, dbCompany);
            }
            // Update counties if provided
            if (countiesToUpdate) {
                await addCountiesToCompanyIfNeeded(dbCompany, countiesToUpdate);
            }
            return dbCompany;
        }
        return null;
    } catch (error) {
        console.error(`[${cityCode} SYNC V2] Error looking up company in database:`, error);
        return null;
    }
}