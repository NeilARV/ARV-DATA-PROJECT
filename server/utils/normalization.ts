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