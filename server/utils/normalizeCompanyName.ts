/**
 * Normalizes a company name for comparison by removing punctuation and standardizing format.
 * This helps match variations like:
 * - "Grandfield Properties, LLC" vs "Grandfield Properties LLC"
 * - "Grandfield Properties, LLC." vs "Grandfield Properties LLC"
 * - "ABC Corp." vs "ABC Corp"
 * 
 * @param name - The company name to normalize
 * @returns A normalized string suitable for comparison, or null if input is invalid
 */
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

/**
 * Normalizes a company name for storage, ensuring consistent formatting.
 * This applies title case and standardizes punctuation.
 * 
 * @param name - The company name to normalize
 * @returns A normalized string suitable for storage/display, or null if input is invalid
 */
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

