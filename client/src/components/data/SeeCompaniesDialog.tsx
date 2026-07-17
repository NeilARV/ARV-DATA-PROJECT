import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { sortCountLabel } from './SortCountBadge';
import { fetchGroupProfile } from '@/api/groups.api';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import type { DirectorySortOption } from '@/types/options';

type SeeCompaniesDialogProps = {
    groupId: string;
    /** Raw group name — formatted at the render edge (ARV.RAW-COMPANY-NAME). */
    groupName: string;
    counties: string[];
    sort: DirectorySortOption;
    /** Selects the member company (switches to the Companies tab and filters the grid to it). */
    onSelectMember: (companyId: string, companyName: string) => void;
};

/**
 * The See Companies roster dialog: the group's member companies, each with its count for the active
 * sort, most-active first. Selecting a member drills into that company. Roster is fetched on demand
 * from the group profile endpoint (county- and sort-scoped).
 */
export function SeeCompaniesDialog({
    groupId,
    groupName,
    counties,
    sort,
    onSelectMember,
}: SeeCompaniesDialogProps) {
    const { data: roster, isLoading } = useQuery({
        queryKey: ['/api/companies/groups', groupId, 'roster', sort, counties],
        queryFn: async () => {
            const profile = await fetchGroupProfile(groupId, { counties, sort });
            return profile?.roster ?? [];
        },
    });

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                    <Building2 className="w-5 h-5 text-primary" />
                    {formatCompanyName(groupName)}
                </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
                Member companies — select one to view its properties.
            </p>

            <div className="space-y-1 mt-2 max-h-[60vh] overflow-y-auto">
                {isLoading ? (
                    <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                ) : !roster || roster.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No member companies found</p>
                ) : (
                    roster.map((member) => {
                        const displayName = formatCompanyName(member.companyName);
                        return (
                            <button
                                key={member.companyId}
                                onClick={() => onSelectMember(member.companyId, member.companyName)}
                                className="w-full flex items-center justify-between gap-3 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer text-left transition-colors"
                                data-testid={`group-member-${member.companyId}`}
                            >
                                <span
                                    className="font-medium text-sm truncate"
                                    title={displayName ?? undefined}
                                >
                                    {displayName}
                                </span>
                                <span className="text-sm font-semibold text-primary whitespace-nowrap">
                                    {member.count} {sortCountLabel(sort, member.count)}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>
        </>
    );
}
