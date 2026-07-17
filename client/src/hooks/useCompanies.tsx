import { createContext, ReactNode, useContext, useState, useCallback, useRef } from 'react';
import type { CompanyContactWithCounts } from '@/types/companies';
import type { DirectorySortOption } from '@/types/options';
import type { GroupDirectoryRow } from '@shared/types/groups';
import { fetchCompanyContactsPage, fetchCompanyById } from '@/api/companies.api';
import { fetchGroupDirectoryRow } from '@/api/groups.api';
import { useFilters } from './useFilters';
import { useView } from './useView';
import { ALL_STATUS_FILTERS } from '@/constants/propertyStatus.constants';

const DEFAULT_PAGE_SIZE = 50;

export type CompaniesContextValue = {
    company: CompanyContactWithCounts | null;
    setCompany: (company: CompanyContactWithCounts | null) => void;
    /** The selected operator group; mutually exclusive with `company` (setting either clears the other). */
    group: GroupDirectoryRow | null;
    setGroup: (group: GroupDirectoryRow | null) => void;
    /**
     * Resolves a ?group= deep link: validates the id against the county-scoped directory, expands
     * filters, and selects the group. @returns false when the link is stale (caller clears the URL).
     */
    ensureGroup: (groupId: string) => Promise<boolean>;
    companies: CompanyContactWithCounts[];
    total: number;
    hasMore: boolean;
    isLoadingCompanies: boolean;
    isLoadingMoreCompanies: boolean;
    directorySort: DirectorySortOption;
    directorySearch: string;
    setDirectorySort: (sort: DirectorySortOption) => void;
    setDirectorySearch: (search: string) => void;
    loadCompanies: (overrides?: {
        sort?: DirectorySortOption;
        search?: string;
        force?: boolean;
    }) => Promise<void>;
    loadMoreCompanies: () => Promise<void>;
    companySelectionInProgressRef: React.MutableRefObject<boolean>;
    /** Tracks the ID of the company for which filters were last expanded. Persists across sidebar tab switches (remounts). Used to expand filters on new company selection but skip on navigation remounts. */
    companyFiltersExpandedRef: React.MutableRefObject<string | null>;
    handleCompanyClick: (
        companyName: string,
        companyId: string | null,
        keepPanelOpen?: boolean,
    ) => void;
    /** When user selects a company from panel/modal that isn't in the loaded list, we fetch and show it here so scroll-into-view works */
    ensuredCompany: CompanyContactWithCounts | null;
    /** Patch a single company entry in the list and selected company state (e.g. after enrich) */
    updateCompanyInList: (id: string, patch: Partial<CompanyContactWithCounts>) => void;
};

const CompaniesContext = createContext<CompaniesContextValue | null>(null);

type CompanyProviderProps = {
    children: ReactNode;
};

export function CompaniesProvider({ children }: CompanyProviderProps) {
    const { filters, setFilters } = useFilters();
    const { setSidebarView } = useView();
    const [company, setCompanyState] = useState<CompanyContactWithCounts | null>(null);
    const [group, setGroupState] = useState<GroupDirectoryRow | null>(null);
    const setCompany = useCallback((value: CompanyContactWithCounts | null) => {
        setCompanyState(value);
        if (value == null) {
            setEnsuredCompany(null);
            companyFiltersExpandedRef.current = null;
        } else {
            // Selections are mutually exclusive — picking a company clears the group.
            setGroupState(null);
        }
    }, []);
    const setGroup = useCallback((value: GroupDirectoryRow | null) => {
        setGroupState(value);
        // Selections are mutually exclusive — picking a group clears the company.
        if (value != null) {
            setCompanyState(null);
            setEnsuredCompany(null);
            companyFiltersExpandedRef.current = null;
        }
    }, []);
    const [companies, setCompaniesState] = useState<CompanyContactWithCounts[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
    const [isLoadingMoreCompanies, setIsLoadingMoreCompanies] = useState(false);
    const [directorySort, setDirectorySortState] = useState<DirectorySortOption>('most-properties');
    const [directorySearch, setDirectorySearchState] = useState('');
    const [ensuredCompany, setEnsuredCompany] = useState<CompanyContactWithCounts | null>(null);
    const companySelectionInProgressRef = useRef(false);
    const companyFiltersExpandedRef = useRef<string | null>(null);
    const loadCompaniesAbortRef = useRef<AbortController | null>(null);
    /** Only reload when counties/sort/search actually change; skip when just re-opening directory with same params */
    const lastLoadedParamsRef = useRef<{
        countiesKey: string;
        sort: string;
        search: string;
    } | null>(null);

    const loadCompanies = useCallback(
        async (overrides?: { sort?: DirectorySortOption; search?: string; force?: boolean }) => {
            const sort = overrides?.sort ?? directorySort;
            const search = overrides?.search ?? directorySearch;
            const force = overrides?.force ?? false;
            // Always filter by the selected counties so the directory matches the property view.
            const counties = filters.counties;
            const countiesKey = counties.join(',');
            // Never run a "load all" (no overrides) when user has active search – prevents search results being overwritten by a stale effect
            if (!force && !overrides && directorySearch.trim() !== '') {
                return;
            }
            // Skip reload when just switching back to directory with same params (first load or county/sort/search change still trigger load)
            if (
                !force &&
                !overrides &&
                lastLoadedParamsRef.current &&
                lastLoadedParamsRef.current.countiesKey === countiesKey &&
                lastLoadedParamsRef.current.sort === sort &&
                lastLoadedParamsRef.current.search === search
            ) {
                return;
            }
            if (force) lastLoadedParamsRef.current = null;
            loadCompaniesAbortRef.current?.abort();
            const controller = new AbortController();
            loadCompaniesAbortRef.current = controller;

            if (overrides?.sort !== undefined) {
                setDirectorySortState(overrides.sort);
                setCompany(null);
            }
            if (overrides?.search !== undefined) setDirectorySearchState(overrides.search);
            setEnsuredCompany(null);
            setPage(1);
            setIsLoadingCompanies(true);
            try {
                // No counties selected shows no companies (mirrors the empty property view).
                if (counties.length === 0) {
                    setCompaniesState([]);
                    setTotal(0);
                    lastLoadedParamsRef.current = { countiesKey, sort, search };
                    return;
                }
                const data = await fetchCompanyContactsPage({
                    counties,
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                    sort,
                    search,
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                if (data) {
                    setCompaniesState(data.companies);
                    setTotal(data.total);
                    lastLoadedParamsRef.current = { countiesKey, sort, search };
                }
            } catch (err) {
                if ((err as Error).name === 'AbortError') return;
                throw err;
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingCompanies(false);
                }
            }
        },
        [filters.counties, directorySort, directorySearch, setCompany],
    );

    const loadMoreCompanies = useCallback(async () => {
        if (filters.counties.length === 0) return;
        const nextPage = page + 1;
        if (total > 0 && (nextPage - 1) * DEFAULT_PAGE_SIZE >= total) return;
        setIsLoadingMoreCompanies(true);
        try {
            const data = await fetchCompanyContactsPage({
                counties: filters.counties,
                page: nextPage,
                limit: DEFAULT_PAGE_SIZE,
                sort: directorySort,
                search: directorySearch,
            });
            if (data && data.companies.length > 0) {
                setCompaniesState((prev) => [...prev, ...data.companies]);
                setPage(nextPage);
            }
        } finally {
            setIsLoadingMoreCompanies(false);
        }
    }, [filters.counties, directorySort, directorySearch, page, total]);

    const setDirectorySort = useCallback((sort: DirectorySortOption) => {
        setDirectorySortState(sort);
    }, []);

    const setDirectorySearch = useCallback((search: string) => {
        setDirectorySearchState(search);
    }, []);

    const handleCompanyClick = useCallback(
        async (companyName: string, companyId: string | null, _keepPanelOpen?: boolean) => {
            companySelectionInProgressRef.current = true;
            // Expand filters to all statuses immediately so useProperties fetches with the correct
            // filters in the same render batch as the company change (prevents race where properties
            // are fetched with old filters before CompanyDirectory's useEffect can expand them).
            companyFiltersExpandedRef.current = companyId ?? companyName;
            setFilters({
                ...filters,
                statusFilters: ALL_STATUS_FILTERS,
                dateRange: 'all-time',
                companyRole: undefined,
            });
            try {
                const found = companies.find(
                    (c) =>
                        c.id === companyId ||
                        c.companyName.trim().toLowerCase() === companyName.trim().toLowerCase(),
                );
                if (found) {
                    setEnsuredCompany(null);
                    setCompany(found);
                } else if (companyId) {
                    const stub: CompanyContactWithCounts = {
                        id: companyId,
                        companyName,
                        propertyCount: 0,
                        propertiesSoldCount: 0,
                        propertiesSoldCountAllTime: 0,
                    } as CompanyContactWithCounts;
                    setCompany(stub);
                    setSidebarView('directory');
                    try {
                        const detail = await fetchCompanyById(companyId, {
                            counties: filters.counties,
                        });
                        if (detail) {
                            const withCounts: CompanyContactWithCounts = {
                                ...detail,
                                companyName: detail.companyName ?? companyName,
                                propertyCount: detail.propertyCount ?? 0,
                                propertiesSoldCount: detail.propertiesSoldCount ?? 0,
                                propertiesSoldCountAllTime: detail.propertiesSoldCountAllTime ?? 0,
                            };
                            setCompany(withCounts);
                            setEnsuredCompany(withCounts);
                        } else {
                            setEnsuredCompany(stub);
                        }
                    } catch {
                        setEnsuredCompany(stub);
                    }
                } else {
                    setCompany({
                        id: '',
                        companyName,
                        propertyCount: 0,
                        propertiesSoldCount: 0,
                        propertiesSoldCountAllTime: 0,
                    } as CompanyContactWithCounts);
                    setEnsuredCompany(null);
                }
                setSidebarView('directory');
            } finally {
                companySelectionInProgressRef.current = false;
            }
        },
        [companies, setCompany, setSidebarView, filters, setFilters],
    );

    const ensureGroup = useCallback(
        async (groupId: string): Promise<boolean> => {
            const row = await fetchGroupDirectoryRow(groupId, {
                counties: filters.counties,
                sort: directorySort,
            });
            // Stale link (disbanded / under two members / no county activity): leave unselected.
            if (!row) return false;
            // Mirror the company deep link: expand to all statuses and full history on selection.
            setFilters({
                ...filters,
                statusFilters: ALL_STATUS_FILTERS,
                dateRange: 'all-time',
                companyRole: undefined,
            });
            setGroup(row);
            return true;
        },
        [filters, setFilters, directorySort, setGroup],
    );

    const updateCompanyInList = useCallback(
        (id: string, patch: Partial<CompanyContactWithCounts>) => {
            setCompaniesState((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
            setCompanyState((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
            setEnsuredCompany((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
        },
        [],
    );

    const hasMore = total > companies.length;

    const value: CompaniesContextValue = {
        company,
        setCompany,
        group,
        setGroup,
        ensureGroup,
        companies,
        total,
        hasMore,
        isLoadingCompanies,
        isLoadingMoreCompanies,
        directorySort,
        directorySearch,
        setDirectorySort,
        setDirectorySearch,
        loadCompanies,
        loadMoreCompanies,
        companySelectionInProgressRef,
        companyFiltersExpandedRef,
        handleCompanyClick,
        ensuredCompany,
        updateCompanyInList,
    };

    return <CompaniesContext.Provider value={value}>{children}</CompaniesContext.Provider>;
}

export function useCompanies(): CompaniesContextValue {
    const ctx = useContext(CompaniesContext);
    if (!ctx) {
        throw new Error('useCompanies must be used within a CompaniesProvider');
    }
    return ctx;
}
