export function formatContactName(name: string | null | undefined): string | null {
    if (!name || typeof name !== 'string') return null;
    return (
        name
            .trim()
            .split(/\s+/)
            .map((word) => {
                if (word.length === 0) return word;
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ') || null
    );
}
