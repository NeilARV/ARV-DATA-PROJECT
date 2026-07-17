import { useRef } from 'react';
import { useGroups } from '@/hooks/useGroups';
import { useCompanies } from '@/hooks/useCompanies';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { GroupCard } from './GroupCard';

/**
 * The Groups tab list: operator groups (2+ member companies) ranked by the shared sort, with
 * infinite-scroll pagination and empty-state copy mirroring the company directory. The shared search
 * and Sort-by controls live in the parent DirectoryPanel; this panel renders only the list + footer.
 */
export function GroupsDirectory() {
    const { groups, total, hasMore, isLoadingGroups, isLoadingMoreGroups, loadMoreGroups } =
        useGroups();
    const { directorySort, directorySearch } = useCompanies();
    const scrollSentinelRef = useRef<HTMLDivElement>(null);

    useInfiniteScroll({
        ref: scrollSentinelRef,
        hasMore,
        loading: isLoadingMoreGroups,
        onLoadMore: loadMoreGroups,
        enabled: !isLoadingGroups,
        useScrollableRoot: true,
        deps: [groups.length],
    });

    return (
        <div
            className="flex-1 min-h-0 bg-background flex flex-col overflow-hidden"
            data-testid="groups-directory"
        >
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingGroups ? (
                    <div className="text-center text-muted-foreground py-8">Loading groups...</div>
                ) : groups.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        {directorySearch ? 'No groups found' : 'No groups in directory'}
                    </div>
                ) : (
                    groups.map((group, index) => (
                        <GroupCard
                            key={group.id}
                            group={group}
                            rank={index + 1}
                            sortBy={directorySort}
                        />
                    ))
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
