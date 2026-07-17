import { useEffect, useMemo, useRef } from 'react';
import { useGroups } from '@/hooks/useGroups';
import { useCompanies } from '@/hooks/useCompanies';
import { useFilters } from '@/hooks/useFilters';
import { useView } from '@/hooks/useView';
import { useProperty } from '@/hooks/useProperty';
import { useAccessGate } from '@/hooks/useAccessGate';
import { useDataNav } from '@/hooks/useNav';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { GroupCard } from './GroupCard';
import { GroupProfile } from './GroupProfile';
import {
    BUYERS_FEED_STATUS_FILTERS,
    COMPANY_DIRECTORY_SORT_FILTERS,
    DEFAULT_STATUS_FILTERS,
    WHOLESALE_VIEW_STATUS_FILTERS,
} from '@/constants/propertyStatus.constants';
import { DEFAULT_DATE_RANGE } from '@/lib/propertyFilters';
import type { GroupDirectoryRow } from '@shared/types/groups';

/**
 * The Groups tab list: operator groups (2+ member companies) ranked by the shared sort, with
 * infinite-scroll pagination and empty-state copy mirroring the company directory. The shared search
 * and Sort-by controls live in the parent DirectoryPanel; this panel renders the list + footer and
 * owns group selection (click toggles; the grid/map filter to all member companies).
 */
export function GroupsDirectory() {
    const { groups, total, hasMore, isLoadingGroups, isLoadingMoreGroups, loadMoreGroups } =
        useGroups();
    const { directorySort, directorySearch, group, setGroup, handleCompanyClick } = useCompanies();
    const { filters, setFilters } = useFilters();
    const { view } = useView();
    const { setProperty } = useProperty();
    const { requireAuth, requireSubscription } = useAccessGate();
    const nav = useDataNav();
    const scrollSentinelRef = useRef<HTMLDivElement>(null);
    // Suppresses the external-deselect filter revert when a card click already batched it.
    const filterResetHandledRef = useRef(false);
    const previousGroupIdRef = useRef<string | null>(null);

    useInfiniteScroll({
        ref: scrollSentinelRef,
        hasMore,
        loading: isLoadingMoreGroups,
        onLoadMore: loadMoreGroups,
        enabled: !isLoadingGroups,
        useScrollableRoot: true,
        deps: [groups.length],
    });

    /** Reverts statuses/date/role to the active view's defaults (used on deselect). */
    const revertFilters = () => {
        const statuses =
            view === 'wholesale'
                ? WHOLESALE_VIEW_STATUS_FILTERS
                : view === 'buyers-feed'
                  ? BUYERS_FEED_STATUS_FILTERS
                  : DEFAULT_STATUS_FILTERS;
        setFilters({
            ...filters,
            statusFilters: statuses,
            dateRange: DEFAULT_DATE_RANGE,
            companyRole: undefined,
        });
    };

    // When the group is deselected externally (tab switch, grid/map "Deselect Group", stale link),
    // revert the filters — mirrors CompanyDirectory's external-deselect effect. Click-initiated
    // changes batch their own filter updates and skip this via filterResetHandledRef.
    useEffect(() => {
        const hadSelection = previousGroupIdRef.current != null;
        const hasSelection = group != null;
        previousGroupIdRef.current = group?.id ?? null;
        if (filterResetHandledRef.current) {
            filterResetHandledRef.current = false;
            return;
        }
        if (!hasSelection && hadSelection) revertFilters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group, view]);

    const handleGroupClick = (clickedGroup: GroupDirectoryRow) => {
        if (group?.id === clickedGroup.id) {
            // Batch filter revert + deselect in one handler so React renders them together.
            filterResetHandledRef.current = true;
            revertFilters();
            setGroup(null);
            nav.setGroupId(null);
            return;
        }
        requireAuth(() => {
            requireSubscription(() => {
                // Selection respects the active sort's statuses + buyer/seller role, full history.
                const { statusFilters, companyRole } =
                    COMPANY_DIRECTORY_SORT_FILTERS[directorySort];
                filterResetHandledRef.current = true;
                setFilters({
                    ...filters,
                    statusFilters,
                    dateRange: 'all-time',
                    companyRole,
                });
                setProperty(null);
                setGroup(clickedGroup);
                nav.setGroupId(clickedGroup.id);
            });
        });
    };

    // Selecting a member from the See Companies roster: switch to that company (which clears the
    // group). Suppress the group-deselect revert so handleCompanyClick's expanded company filters
    // survive instead of being reset to the view defaults — mirrors handleGroupClick's own deselect.
    const handleSelectMember = (companyId: string, companyName: string) => {
        filterResetHandledRef.current = true;
        setProperty(null);
        handleCompanyClick(companyName, companyId);
    };

    // A deep-linked group won't be in the loaded page — prepend it (unranked) so its selected card
    // is visible, mirroring the company directory's ensured-company treatment.
    const displayList = useMemo(() => {
        if (group && !groups.some((g) => g.id === group.id)) return [group, ...groups];
        return groups;
    }, [group, groups]);
    const isEnsuredPrepended = displayList !== groups;

    return (
        <div
            className="flex-1 min-h-0 bg-background flex flex-col overflow-hidden"
            data-testid="groups-directory"
        >
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingGroups ? (
                    <div className="text-center text-muted-foreground py-8">Loading groups...</div>
                ) : displayList.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        {directorySearch ? 'No groups found' : 'No groups in directory'}
                    </div>
                ) : (
                    displayList.map((listGroup, index) => {
                        const rank = isEnsuredPrepended
                            ? index === 0
                                ? undefined
                                : index
                            : index + 1;
                        const isSelected = group?.id === listGroup.id;
                        return (
                            <div key={listGroup.id}>
                                <GroupCard
                                    group={listGroup}
                                    rank={rank}
                                    sortBy={directorySort}
                                    isSelected={isSelected}
                                    onSelect={() => handleGroupClick(listGroup)}
                                />
                                {isSelected && (
                                    <GroupProfile
                                        group={listGroup}
                                        rank={rank}
                                        onSelectMember={handleSelectMember}
                                    />
                                )}
                            </div>
                        );
                    })
                )}
                {hasMore && (
                    <div ref={scrollSentinelRef} className="h-4 flex-shrink-0" aria-hidden />
                )}
                {isLoadingMoreGroups && (
                    <div className="text-center text-muted-foreground py-4 text-sm">
                        Loading more...
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-border">
                <div className="text-xs text-muted-foreground text-center">
                    {total} {total === 1 ? 'group' : 'groups'}
                </div>
            </div>
        </div>
    );
}
