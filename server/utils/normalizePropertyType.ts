/**
 * Normalizes property type strings based on specific rules.
 * 
 * Rules:
 * 1. "Single Family Residential" stays as is
 * 2. If contains "Condominium", store as "Condominium"
 * 3. If contains "Duplex", store as "Duplex"
 * 4. If contains "Triplex", store as "Triplex"
 * 5. If contains "Fourplex", store as "Fourplex"
 * 6. If contains "Townhome", "Townhouse", "Town Home", or "Town House", store as "Townhouse"
 * 7. If contains "Vacant", "Vacant Land", or "Vacant Lot", store as "Vacant Land"
 * 
 * @param propertyType - The property type string to normalize
 * @returns A normalized property type string, or null if input is invalid
 */
export function normalizePropertyType(propertyType: string | null | undefined): string | null {
    if (!propertyType || typeof propertyType !== 'string') return null;
    
    const trimmed = propertyType.trim();
    if (trimmed.length === 0) return null;
    
    const lowerType = trimmed.toLowerCase();
    
    // Check rules in order of specificity
    // 1. Single Family Residential stays as is (case-sensitive check)
    if (trimmed === 'Single Family Residential') {
        return 'Single Family Residential';
    }
    
    // 2. Check for Condominium (case-insensitive)
    if (lowerType.includes('condominium')) {
        return 'Condominium';
    }
    
    // 3. Check for Duplex (case-insensitive)
    if (lowerType.includes('duplex')) {
        return 'Duplex';
    }
    
    // 4. Check for Triplex (case-insensitive)
    if (lowerType.includes('triplex')) {
        return 'Triplex';
    }
    
    // 5. Check for Fourplex (case-insensitive)
    if (lowerType.includes('fourplex')) {
        return 'Fourplex';
    }
    
    // 6. Check for Townhome variations (case-insensitive)
    if (lowerType.includes('townhome') || 
        lowerType.includes('townhouse') || 
        lowerType.includes('town home') || 
        lowerType.includes('town house')) {
        return 'Townhouse';
    }
    
    // 7. Check for Vacant variations (case-insensitive)
    if (lowerType.includes('vacant land') || 
        lowerType.includes('vacant lot') || 
        (lowerType.includes('vacant') && !lowerType.includes('non-vacant'))) {
        return 'Vacant Land';
    }
    
    // If no match, return the original (could add title case normalization here if needed)
    return trimmed;
}

