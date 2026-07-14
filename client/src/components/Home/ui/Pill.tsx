/** A small neutral pill used for section tags (e.g. the deal-calculator eyebrow). */
export function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {children}
        </span>
    );
}
