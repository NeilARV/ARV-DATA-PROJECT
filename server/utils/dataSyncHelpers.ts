import { db } from "server/storage";
import { companies } from "../../database/schemas/companies.schema";
import { eq } from "drizzle-orm";

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

// Helper function to check if a name/entity is a trust (exported for property-status job)
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