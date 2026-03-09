export function formatCompanyName(name: string | null | undefined): string | null {
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
