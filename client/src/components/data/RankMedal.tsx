type RankMedalProps = { rank: number | null | undefined };

/** The left-accent border class for a top-three directory rank, or '' for any other rank. Shared by
 * the company and group cards so their medal treatment cannot drift. */
export function rankMedalBorderClass(rank: number | null | undefined): string {
    if (rank === 1) return 'border-l-4 border-l-amber-400';
    if (rank === 2) return 'border-l-4 border-l-slate-400';
    if (rank === 3) return 'border-l-4 border-l-amber-700';
    return '';
}

/**
 * Directory rank indicator: a colored medal for the top three, a plain numeric rank below, or nothing when rank is nullish.
 */
export function RankMedal({ rank }: RankMedalProps) {
    if (rank == null) return null;
    if (rank <= 3) {
        return (
            <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    rank === 1
                        ? 'bg-amber-400 text-white'
                        : rank === 2
                          ? 'bg-muted-foreground text-background'
                          : 'bg-amber-700 text-amber-100'
                }`}
                data-testid={`text-rank-${rank}`}
            >
                {rank}
            </span>
        );
    }
    return (
        <span
            className="text-primary font-bold text-sm leading-tight"
            data-testid={`text-rank-${rank}`}
        >
            {rank}.
        </span>
    );
}
