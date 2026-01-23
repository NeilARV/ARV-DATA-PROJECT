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

// Helper function to check if a name/entity is a flipping company (corporate but not trust)
function isFlippingCompany(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
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