import { Building2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { RankMedal, rankMedalBorderClass } from './RankMedal';
import { SortCountBadge } from './SortCountBadge';
import type { GroupDirectoryRow } from '@shared/types/groups';
import type { DirectorySortOption } from '@/types/options';

type GroupCardProps = {
    group: GroupDirectoryRow;
    /** Position in the ranked list; undefined for a deep-linked group prepended outside its page. */
    rank?: number;
    sortBy: DirectorySortOption;
    isSelected?: boolean;
    onSelect?: () => void;
};

/**
 * An operator-group card for the Data-app Groups tab: rank medal | formatted group name +
 * "N companies" | aggregate per-sort count badge | chevron. Mirrors the company card's four-column
 * shell via the shared RankMedal/SortCountBadge primitives so the two never drift visually.
 * Clicking toggles group selection (filters the grid/map to all member companies).
 */
export function GroupCard({ group, rank, sortBy, isSelected = false, onSelect }: GroupCardProps) {
    const medalBorder = rankMedalBorderClass(rank);

    return (
        <Card
            className={`p-3 hover-elevate active-elevate-2 cursor-pointer transition-all ${isSelected ? 'ring-2 ring-primary' : ''} ${medalBorder}`}
            onClick={onSelect}
            data-testid={`card-group-${group.id}`}
        >
            <div className="flex items-center gap-2">
                {/* Col 1: Rank */}
                <div className="flex-shrink-0 w-5 flex items-center justify-center">
                    <RankMedal rank={rank} />
                </div>

                {/* Col 2: Group name + company count */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <div
                        className="font-medium text-sm leading-tight break-words"
                        data-testid="text-group-name"
                    >
                        {formatCompanyName(group.name)}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="text-sm truncate" data-testid="text-group-company-count">
                            {group.companyCount} companies
                        </span>
                    </div>
                </div>

                {/* Col 3: Aggregate per-sort count badge */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <SortCountBadge sortBy={sortBy} counts={group} />
                </div>

                {/* Col 4: Chevron */}
                <div className="flex-shrink-0 flex items-center">
                    {isSelected ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                </div>
            </div>
        </Card>
    );
}
