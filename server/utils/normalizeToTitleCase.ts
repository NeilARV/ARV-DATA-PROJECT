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