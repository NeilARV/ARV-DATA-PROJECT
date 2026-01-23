import { STREET_TYPE_ABBREVIATIONS } from "server/constants/streetTypes.constants";

// Helper function to normalize county name from API response
// Handles formats like "San Diego County, California" -> "San Diego"
export function normalizeCountyName(county: string | null | undefined): string | null {
    if (!county || typeof county !== 'string') {
        return null;
    }
    
    let normalized = county.trim();
    
    // Remove state suffix (e.g., ", California" or ", CA")
    const commaIndex = normalized.indexOf(',');
    if (commaIndex !== -1) {
        normalized = normalized.substring(0, commaIndex).trim();
    }
    
    // Remove "County" suffix if present
    if (normalized.toLowerCase().endsWith(' county')) {
        normalized = normalized.substring(0, normalized.length - 7).trim();
    }
    
    return normalized || null;
}

// Normalize text to Title Case (first letter of each word capitalized, rest lowercase)
// Special handling: "LLC" stays all caps
export function normalizeToTitleCase(text: string | null | undefined): string | null {
    if (!text || typeof text !== 'string') return null;

    return text.trim().split(/\s+/).map(word => {
        if (word.length === 0) return word;
        
        // Handle LLC - keep it all caps regardless of input case
        const upperWord = word.toUpperCase();
        if (upperWord === 'LLC') {
            return 'LLC';
        }
        
        // Capitalize first letter, lowercase the rest
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
}

// Normalizes subdivision names to title case, but keeps numeric strings as-is.
// Example: "SUMMER HILL" -> "Summer Hill", "24515" -> "24515"
export function normalizeSubdivision(subdivision: string | null | undefined): string | null {
    if (!subdivision || typeof subdivision !== 'string') return null;
    
    const trimmed = subdivision.trim();
    if (trimmed.length === 0) return null;
    
    // If the entire string is numeric, keep it as-is
    if (/^\d+$/.test(trimmed)) {
        return trimmed;
    }
    
    // Otherwise, apply title case normalization
    return normalizeToTitleCase(trimmed);
}

// Normalizes a company name for comparison by removing punctuation and standardizing format.
// This helps match variations like:
export function normalizeCompanyNameForComparison(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  
  return name
    .trim()
    // Remove common punctuation: commas, periods, semicolons, colons
    .replace(/[,.;:]/g, '')
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Convert to lowercase for case-insensitive comparison
    .toLowerCase();
}

// Normalizes a company name for storage, ensuring consistent formatting.
// This applies title case and standardizes punctuation.
export function normalizeCompanyNameForStorage(name: string | null | undefined): string | null {
  if (!name || typeof name !== 'string') return null;
  
  // First normalize to title case
  const titleCase = name
    .trim()
    .split(/\s+/)
    .map(word => {
      if (word.length === 0) return word;
      
      // Remove trailing punctuation from word before processing
      const cleanWord = word.replace(/[,.;]+$/, '');
      
      // Handle common business suffixes - keep them in specific formats
      const upperWord = cleanWord.toUpperCase();
      if (upperWord === 'LLC') return 'LLC';
      if (upperWord === 'LLP') return 'LLP';
      if (upperWord === 'PLLC') return 'PLLC';
      if (upperWord === 'LC') return 'LC';
      if (upperWord === 'PC' || upperWord === 'P.C.') return 'PC';
      if (upperWord === 'LP') return 'LP';
      if (upperWord === 'GP') return 'GP';
      if (upperWord === 'INC' || upperWord === 'INCORPORATED') return 'Inc';
      if (upperWord === 'CORP' || upperWord === 'CORPORATION') return 'Corp';
      
      // Capitalize first letter, lowercase the rest
      return cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
    })
    .join(' ');
  
  // Remove trailing punctuation (periods, commas) but keep the structure
  return titleCase.replace(/[,.;]+$/, '').trim();
}

// Normalizes property types based on specific rules
/**
 * Rules:
 * 1. If contains "Single Family" (including "Single Family Residential"), store as "Single Family"
 * 2. If contains "Condominium", store as "Condominium"
 * 3. If contains "Duplex", store as "Duplex"
 * 4. If contains "Triplex", store as "Triplex"
 * 5. If contains "Fourplex", store as "Fourplex"
 * 6. If contains "Townhome", "Townhouse", "Town Home", or "Town House", store as "Townhouse"
 * 7. If contains "Vacant", "Vacant Land", or "Vacant Lot", store as "Vacant Land"
 */
export function normalizePropertyType(propertyType: string | null | undefined): string | null {
    if (!propertyType || typeof propertyType !== 'string') return null;
    
    const trimmed = propertyType.trim();
    if (trimmed.length === 0) return null;
    
    const lowerType = trimmed.toLowerCase();
    
    // Check rules in order of specificity
    // 1. Single Family Residential → Single Family (case-insensitive)
    if (lowerType.includes('single family residential') || 
        (lowerType.includes('single') && lowerType.includes('family') && !lowerType.includes('multi'))) {
        return 'Single Family';
    }
    
    // 2. Check for Condominium (case-insensitive)
    if (lowerType.includes('condominium')) {
        return 'Condo';
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

// Normalize address to standard format based on specific rules
/**
 * Rules:
 * 1. Capitalize first letter of each word in street name
 * 2. Use standard abbreviations for street types (Ave, Dr, St, etc.) without periods
 * 3. Preserve street numbers
 */ 
export function normalizeAddress(address: string | null | undefined): string | null {
    if (!address || typeof address !== 'string') return null;

    const trimmed = address.trim();
    if (trimmed.length === 0) return null;

    // Split address into parts (number and street)
    // Pattern: optional number, then street name
    const parts = trimmed.split(/\s+/);
    
    if (parts.length === 0) return null;

    // First part is usually the street number
    const normalizedParts: string[] = [];
    let i = 0;

    // Keep the street number as-is (first token that looks like a number)
    if (parts.length > 0 && /^\d+/.test(parts[0])) {
        normalizedParts.push(parts[0]);
        i = 1;
    }

    // Process the rest as street name
    const streetParts: string[] = [];
    for (; i < parts.length; i++) {
        streetParts.push(parts[i]);
    }

    // Normalize each word in the street name
    const normalizedStreet = streetParts.map((word, index) => {
        const lowerWord = word.toLowerCase();
        const isLastWord = index === streetParts.length - 1;
        
        // Check if this is a street type abbreviation (usually the last word)
        if (isLastWord && STREET_TYPE_ABBREVIATIONS[lowerWord]) {
            return STREET_TYPE_ABBREVIATIONS[lowerWord];
        }
        
        // Capitalize first letter, lowercase the rest
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');

    // Combine number and normalized street
    if (normalizedParts.length > 0) {
        return `${normalizedParts[0]} ${normalizedStreet}`.trim();
    }
    
    return normalizedStreet.trim();
}

// Helper to normalize date values to YYYY-MM-DD format
export function normalizeDateToYMD(dateValue: string | Date | null | undefined, options?: { subtractDays?: number }): string | null {
    if (!dateValue) return null;
    
    let date: Date;
    
    if (dateValue instanceof Date) {
        if (isNaN(dateValue.getTime())) return null;
        date = new Date(dateValue);
    } else if (typeof dateValue === "string") {
        // Extract just the date part if it has a timestamp
        const datePart = dateValue.split("T")[0];
        date = new Date(datePart);
        if (isNaN(date.getTime())) return null;
    } else {
        return null;
    }
    
    // Optionally subtract days
    if (options?.subtractDays) {
        date.setDate(date.getDate() - options.subtractDays);
    }
    
    return date.toISOString().split("T")[0];
}