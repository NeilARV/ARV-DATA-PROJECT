import { createContext, ReactNode, useContext, useState, useCallback, useRef } from 'react';
import type { GroupDirectoryRow } from '@shared/types/groups';
import type { DirectorySortOption } from '@/types/options';
import { fetchGroupDirectoryPage } from '@/api/groups.api';
import { useFilters } from './useFilters';

const DEFAULT_PAGE_SIZE = 50;

export type GroupsContextValue = {
    groups: GroupDirectoryRow[];
    total: number;
    hasMore: boolean;
    isLoadingGroups: boolean;
    isLoadingMoreGroups: boolean;
    /** Load the first page for the given sort/search under the current counties. Skips a redundant
     * reload when counties/sort/search are unchanged (unless `force`). Sort/search are passed in by
     * the shared directory controls rather than owned here. */
    loadGroups: (opts: {
        sort: DirectorySortOption;
        search: string;
        force?: boolean;
    }) => Promise<void>;
    loadMoreGroups: () => Promise<void>;
};

const GroupsContext = createContext<GroupsContextValue | null>(null);

export function GroupsProvider({ children }: { children: ReactNode }) {
    const { filters } = useFilters();
    const [groups, setGroups] = useState<GroupDirectoryRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [isLoadingMoreGroups, setIsLoadingMoreGroups] = useState(false);
    const loadAbortRef = useRef<AbortController | null>(null);
    const lastLoadedParamsRef = useRef<{ countiesKey: string; sort: string; search: string } | null>(
        null,
    );
    // The applied sort/search, remembered so loadMoreGroups pages the same query.
    const activeSortRef = useRef<DirectorySortOption>('most-properties');
    const activeSearchRef = useRef('');

    const loadGroups = useCallback(
        async (opts: { sort: DirectorySortOption; search: string; force?: boolean }) => {
            const { sort, search, force = false } = opts;
            const counties = filters.counties;
            const countiesKey = counties.join(',');
            if (
                !force &&
                lastLoadedParamsRef.current &&
                lastLoadedParamsRef.current.countiesKey === countiesKey &&
                lastLoadedParamsRef.current.sort === sort &&
                lastLoadedParamsRef.current.search === search
            ) {
                return;
            }
            loadAbortRef.current?.abort();
            const controller = new AbortController();
            loadAbortRef.current = controller;
            activeSortRef.current = sort;
            activeSearchRef.current = search;
            setPage(1);
            setIsLoadingGroups(true);
            try {
                // No counties selected shows no groups (mirrors the empty company directory).
                if (counties.length === 0) {
                    setGroups([]);
                    setTotal(0);
                    lastLoadedParamsRef.current = { countiesKey, sort, search };
                    return;
                }
                const data = await fetchGroupDirectoryPage({
                    counties,
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                    sort,
                    search,
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                if (data) {
                    setGroups(data.groups);
                    setTotal(data.total);
                    lastLoadedParamsRef.current = { countiesKey, sort, search };
                }
            } finally {
                if (!controller.signal.aborted) setIsLoadingGroups(false);
            }
        },
        [filters.counties],
    );

    const loadMoreGroups = useCallback(async () => {
        if (filters.counties.length === 0) return;
        const nextPage = page + 1;
        if (total > 0 && (nextPage - 1) * DEFAULT_PAGE_SIZE >= total) return;
        setIsLoadingMoreGroups(true);
        try {
            const data = await fetchGroupDirectoryPage({
                counties: filters.counties,
                page: nextPage,
                limit: DEFAULT_PAGE_SIZE,
                sort: activeSortRef.current,
                search: activeSearchRef.current,
            });
            if (data && data.groups.length > 0) {
                setGroups((prev) => [...prev, ...data.groups]);
                setPage(nextPage);
            }
        } finally {
            setIsLoadingMoreGroups(false);
        }
    }, [filters.counties, page, total]);

    const hasMore = total > groups.length;

    const value: GroupsContextValue = {
        groups,
        total,
        hasMore,
        isLoadingGroups,
        isLoadingMoreGroups,
        loadGroups,
        loadMoreGroups,
    };

    return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups(): GroupsContextValue {
    const ctx = useContext(GroupsContext);
    if (!ctx) {
        throw new Error('useGroups must be used within a GroupsProvider');
    }
    return ctx;
}
