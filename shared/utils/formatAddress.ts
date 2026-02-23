import { STREET_TYPE_ABBREVIATIONS } from "../constants/street-types";

// Normalize address to standard format based on specific rules
/**
 * Rules:
 * 1. Capitalize first letter of each word in street name
 * 2. Use standard abbreviations for street types (Ave, Dr, St, etc.) without periods
 * 3. Preserve street numbers
 */ 
export function formatAddress(address: string | null | undefined): string | null {
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