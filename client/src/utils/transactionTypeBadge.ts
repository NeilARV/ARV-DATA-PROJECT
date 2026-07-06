// Sanctioned hex exception — see design-guidelines.md § Transaction Type Colors: brand-specific
// categorical badge colors with no semantic token equivalent (translucent tinted background,
// saturated border, darker same-hue text).
const TYPE_COLORS: Record<string, string> = {
    'arms length': 'bg-[#22C55E]/15 text-[#16A34A] border-[#22C55E]/30',
    'non-arms length': 'bg-[#F59E0B]/15 text-[#D97706] border-[#F59E0B]/30',
    assignment: 'bg-[#9333EA]/15 text-[#7E22CE] border-[#9333EA]/30',
    refinance: 'bg-[#3B82F6]/15 text-[#1D4ED8] border-[#3B82F6]/30',
    heloc: 'bg-[#06B6D4]/15 text-[#0E7490] border-[#06B6D4]/30',
    'new construction': 'bg-[#EF4444]/15 text-[#DC2626] border-[#EF4444]/30',
    acquisition: 'bg-[#69C9E1]/15 text-[#0891B2] border-[#69C9E1]/30',
};

/**
 * Badge classes for a transaction-type chip, shared by the transaction lists
 * (PropertyTransactions, TransactionHistory) so they read the same. Unknown or
 * missing types fall back to the muted tokens.
 */
export function transactionTypeBadgeClass(type: string | null): string {
    const key = (type ?? '').trim().toLowerCase();
    return TYPE_COLORS[key] ?? 'bg-muted text-muted-foreground border-border';
}
