import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, RefreshCw, Trophy, Eye, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GroupDetailDialog from '@/components/admin/GroupDetailDialog';
import { AcquisitionActivity } from './AcquisitionActivity';
import { useAuth } from '@/hooks/use-auth';
import { useView } from '@/hooks/useView';
import { useCompanies } from '@/hooks/useCompanies';
import { useGroups } from '@/hooks/useGroups';
import { useFilters } from '@/hooks/useFilters';
import { useDataNav } from '@/hooks/useNav';
import { fetchGroupProfile, fetchGroupDirectoryRow } from '@/api/groups.api';
import type { GroupDirectoryRow } from '@shared/types/groups';

type GroupProfileProps = {
    group: GroupDirectoryRow;
    /** Position in the ranked list; undefined for a deep-linked group prepended outside its page. */
    rank?: number;
};

/**
 * Expanded aggregate profile for a selected operator group: owned/YTD-sold/assigned stats summed
 * across member companies, ranking among groups, the shared 90-day chart, and View Properties.
 * Admin/owner additionally get a Manage Group link into the existing admin group dialog.
 */
export function GroupProfile({ group, rank }: GroupProfileProps) {
    const { isAdmin, isOwner } = useAuth();
    const { setView } = useView();
    const { setGroup, directorySort, directorySearch } = useCompanies();
    const { loadGroups } = useGroups();
    const { filters } = useFilters();
    const nav = useDataNav();
    const queryClient = useQueryClient();
    const [isManageOpen, setIsManageOpen] = useState(false);

    const { data: profile } = useQuery({
        queryKey: ['/api/companies/groups', group.id, 'profile'],
        queryFn: () => fetchGroupProfile(group.id),
    });

    const handleManageClose = async () => {
        setIsManageOpen(false);
        // Managing may have changed membership — refresh the profile and the ranked list, and
        // deselect gracefully when the group fell out of view (disbanded, merged, under two members).
        queryClient.invalidateQueries({
            queryKey: ['/api/companies/groups', group.id, 'profile'],
        });
        await loadGroups({ sort: directorySort, search: directorySearch, force: true });
        const fresh = await fetchGroupDirectoryRow(group.id, {
            counties: filters.counties,
            sort: directorySort,
        });
        if (!fresh) {
            // The directory's external-deselect effect reverts the property filters.
            setGroup(null);
            nav.setGroupId(null);
        }
    };

    return (
        <div
            className="mt-1 mb-2 ml-4 p-3 bg-muted/50 rounded-md border border-border space-y-3"
            onClick={(e) => e.stopPropagation()}
            data-testid={`group-profile-${group.id}`}
        >
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Group Profile
            </div>

            {/* Properties Owned */}
            <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-primary" />
                <span className="text-sm">
                    <span className="text-muted-foreground">Properties Owned: </span>
                    {profile ? (
                        <span className="font-semibold text-foreground">
                            {profile.propertyCount}
                        </span>
                    ) : (
                        <span className="italic text-muted-foreground">Loading...</span>
                    )}
                </span>
            </div>

            {/* YTD Properties Sold */}
            <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-primary" />
                <span className="text-sm">
                    <span className="text-muted-foreground">YTD Properties Sold: </span>
                    {profile ? (
                        <span className="font-semibold text-foreground">
                            {profile.propertiesSoldCount}
                        </span>
                    ) : (
                        <span className="italic text-muted-foreground">Loading...</span>
                    )}
                </span>
            </div>

            {/* Properties Assigned */}
            <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                <span className="text-sm">
                    <span className="text-muted-foreground">Properties Assigned: </span>
                    {profile ? (
                        <span className="font-semibold text-foreground">
                            {profile.propertiesAssignedCount}
                        </span>
                    ) : (
                        <span className="italic text-muted-foreground">Loading...</span>
                    )}
                </span>
            </div>

            {/* Market Ranking among groups (position in the ranked list, like the company profile) */}
            <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="text-sm">
                    <span className="text-muted-foreground">Market Ranking: </span>
                    <span className="font-bold text-primary">
                        {rank != null ? `#${rank}` : '—'}
                    </span>
                </span>
            </div>

            <AcquisitionActivity
                total={profile?.acquisition90DayTotal}
                byMonth={profile?.acquisition90DayByMonth}
            />

            {/* View Properties — visible to all users */}
            <div className="pt-3 border-t border-border space-y-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                        e.stopPropagation();
                        setView('grid');
                    }}
                    data-testid="button-view-group-properties"
                >
                    <Eye className="w-4 h-4 mr-2" />
                    View Properties
                </Button>
            </div>

            {/* Manage Group — admin/owner only, opens the existing admin group dialog */}
            {(isAdmin || isOwner) && (
                <div className="pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                            Admin Only
                        </span>
                        <div className="flex-1 h-px bg-border" />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsManageOpen(true);
                        }}
                        data-testid="button-manage-group"
                    >
                        <Settings className="w-4 h-4 mr-2" />
                        Manage Group
                    </Button>
                </div>
            )}

            <GroupDetailDialog
                groupId={isManageOpen ? group.id : null}
                onClose={handleManageClose}
            />
        </div>
    );
}
