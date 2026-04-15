import { db } from "server/storage";
import { companies, companyCounties } from "@database/schemas/companies.schema";
import { eq, and } from "drizzle-orm";

// Known county → state mapping for MSAs we track
const COUNTY_STATE_MAP: Record<string, string> = {
    'San Diego': 'CA',
    'Orange': 'CA',
    'Los Angeles': 'CA',
    'San Francisco': 'CA',
    'Alameda': 'CA',
    'Contra Costa': 'CA',
    'Marin': 'CA',
    'San Mateo': 'CA',
    'Denver': 'CO',
    'Adams': 'CO',
    'Arapahoe': 'CO',
    'Broomfield': 'CO',
    'Jefferson': 'CO',
    'Douglas': 'CO',
    'Clear Creek': 'CO',
    'Gilpin': 'CO',
    'Elbert': 'CO',
    'Park': 'CO',
    'Miami-Dade': 'FL',
    'Broward': 'FL',
    'Palm Beach': 'FL',
    'St. Lucie': 'FL',
    'Martin': 'FL',
    'King': 'WA',
    'Pierce': 'WA',
    'Snohomish': 'WA',
};

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

// Helper to add counties to a company via company_counties table
export async function addCountiesToCompanyIfNeeded(
    company: { id: string },
    countiesToAdd: string[] | Set<string>
): Promise<void> {
    const newCounties = Array.isArray(countiesToAdd) ? countiesToAdd : Array.from(countiesToAdd);
    if (newCounties.length === 0) return;

    for (const county of newCounties) {
        const state = COUNTY_STATE_MAP[county];
        if (!state) {
            console.warn(`addCountiesToCompanyIfNeeded: unknown county "${county}" — no state mapping, skipping`);
            continue;
        }
        await db
            .insert(companyCounties)
            .values({ companyId: company.id, county, state })
            .onConflictDoNothing();
    }
}
