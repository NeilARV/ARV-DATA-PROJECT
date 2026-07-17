import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompanyDirectory from './CompanyDirectory';
import { GroupsDirectory } from './GroupsDirectory';
import { useCompanies } from '@/hooks/useCompanies';
import { useGroups } from '@/hooks/useGroups';
import { useFilters } from '@/hooks/useFilters';
import { useDataNav } from '@/hooks/useNav';
import type { DirectorySortOption } from '@/types/options';

const SEARCH_DEBOUNCE_MS = 300;

type DirectoryTab = 'companies' | 'groups';

/**
 * The sidebar directory shell: a shared search box and Sort-by control sit above Companies/Groups
 * tabs. Sort drives the active tab; search drives both tabs at once so each tab header can show a
 * live match count for the current query. Both panels stay mounted (visibility toggled) so their
 * state/effects persist; switching tabs clears the active company selection (selections are mutually
 * exclusive). The Groups tab loads lazily on first switch, on any sort/search/county change while
 * active, and whenever a search is applied.
 */
export function DirectoryPanel() {
    const {
        directorySort,
        directorySearch,
        setDirectorySort,
        loadCompanies,
        company,
        setCompany,
        group,
        setGroup,
        total: companiesTotal,
    } = useCompanies();
    const { loadGroups, total: groupsTotal } = useGroups();
    const { filters } = useFilters();
    const nav = useDataNav();

    // The initial tab derives from the URL: ?group= lands on Groups, ?company= (which wins when
    // both are present — see useDataNav) or neither lands on Companies.
    const [activeTab, setActiveTab] = useState<DirectoryTab>(() =>
        nav.groupId ? 'groups' : 'companies',
    );

    // Follow later URL-driven selection changes (e.g. a company picked from a property modal while
    // the Groups tab is active) so the visible tab always matches the selection's dimension.
    useEffect(() => {
        if (nav.groupId) setActiveTab('groups');
        else if (nav.companyId) setActiveTab('companies');
    }, [nav.groupId, nav.companyId]);
    const [searchInput, setSearchInput] = useState(directorySearch);
    const debouncedSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the shared input in sync when the search value changes elsewhere (e.g. programmatic reset).
    useEffect(() => {
        setSearchInput(directorySearch);
    }, [directorySearch]);

    // Apply a search value to BOTH tabs so each header's match count stays live for the current
    // query. loadCompanies sets the shared directorySearch, which the effect below keys on to
    // reload groups.
    const applySearch = useCallback(
        (value: string) => {
            loadCompanies({ search: value });
        },
        [loadCompanies],
    );

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchInput(value);
            if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
            debouncedSearchRef.current = setTimeout(() => {
                applySearch(value);
                debouncedSearchRef.current = null;
            }, SEARCH_DEBOUNCE_MS);
        },
        [applySearch],
    );

    const handleClearSearch = useCallback(() => {
        setSearchInput('');
        applySearch('');
    }, [applySearch]);

    const handleSortChange = useCallback(
        (sort: DirectorySortOption) => {
            setDirectorySort(sort);
            if (activeTab === 'companies') loadCompanies({ sort });
            // Groups reload via the effect below (keyed on directorySort).
        },
        [activeTab, setDirectorySort, loadCompanies],
    );

    const handleTabChange = useCallback(
        (tab: string) => {
            const next = tab as DirectoryTab;
            if (next === activeTab) return;
            setActiveTab(next);
            if (next === 'groups') {
                // Selections are mutually exclusive: leaving Companies clears the selected company,
                // which reverts the property view to its default via CompanyDirectory's effect.
                if (company) {
                    setCompany(null);
                    nav.setCompanyId(null);
                }
            } else {
                // Leaving Groups likewise clears the selected group (GroupsDirectory's effect
                // reverts the filters).
                if (group) {
                    setGroup(null);
                    nav.setGroupId(null);
                }
                // Returning to Companies: reflect the current shared sort/search (they may have
                // changed while the Groups tab was active).
                loadCompanies({ sort: directorySort, search: directorySearch });
            }
        },
        [
            activeTab,
            company,
            setCompany,
            group,
            setGroup,
            nav,
            loadCompanies,
            directorySort,
            directorySearch,
        ],
    );

    // Load the Groups tab lazily on first switch, and reload it on any sort/search/county change
    // while it is active — or whenever a search is applied, so the Groups match count stays live
    // even from the Companies tab. loadGroups de-duplicates unchanged params.
    useEffect(() => {
        if (activeTab !== 'groups' && directorySearch.trim() === '') return;
        loadGroups({ sort: directorySort, search: directorySearch });
    }, [activeTab, filters.counties, directorySort, directorySearch, loadGroups]);

    // Match counts are only meaningful while a query is applied; the debounced input may briefly
    // differ from directorySearch, so gate on the applied value the totals correspond to.
    const showMatchCounts = directorySearch.trim() !== '';

    return (
        <div
            className="flex-1 min-h-0 bg-background flex flex-col overflow-hidden"
            data-testid="sidebar-directory"
        >
            <div className="p-4 border-b border-border space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder={
                            activeTab === 'companies'
                                ? 'Search companies or contacts...'
                                : 'Search groups or member companies...'
                        }
                        value={searchInput}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9"
                        data-testid="input-directory-search"
                    />
                    {searchInput && (
                        <X
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors"
                            onClick={handleClearSearch}
                        />
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                        Sort by:
                    </span>
                    <Select
                        value={directorySort}
                        onValueChange={(value) => handleSortChange(value as DirectorySortOption)}
                    >
                        <SelectTrigger className="h-8 text-sm" data-testid="select-directory-sort">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="most-properties" data-testid="sort-most-properties">
                                Most Properties Owned
                            </SelectItem>
                            <SelectItem
                                value="most-sold-properties"
                                data-testid="sort-most-sold-properties"
                            >
                                Most Sold Properties (YTD)
                            </SelectItem>
                            <SelectItem
                                value="most-sold-properties-all-time"
                                data-testid="sort-most-sold-properties-all-time"
                            >
                                Most Sold Properties (All-Time)
                            </SelectItem>
                            <SelectItem
                                value="most-bought-properties"
                                data-testid="sort-most-bought-properties"
                            >
                                Most Bought Properties (YTD)
                            </SelectItem>
                            <SelectItem
                                value="most-bought-properties-all-time"
                                data-testid="sort-most-bought-properties-all-time"
                            >
                                Most Bought Properties (All-Time)
                            </SelectItem>
                            <SelectItem value="buys-wholesale" data-testid="sort-buys-wholesale">
                                Buys from Wholesalers
                            </SelectItem>
                            <SelectItem value="wholesalers" data-testid="sort-wholesalers">
                                Wholesalers
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid h-9 w-full grid-cols-2">
                        <TabsTrigger value="companies" data-testid="tab-companies">
                            {showMatchCounts ? `Companies (${companiesTotal})` : 'Companies'}
                        </TabsTrigger>
                        <TabsTrigger value="groups" data-testid="tab-groups">
                            {showMatchCounts ? `Groups (${groupsTotal})` : 'Groups'}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Both panels stay mounted; the inactive one is hidden to preserve its state and effects. */}
            <div
                className={`flex-1 min-h-0 flex flex-col ${activeTab === 'companies' ? '' : 'hidden'}`}
            >
                <CompanyDirectory />
            </div>
            <div
                className={`flex-1 min-h-0 flex flex-col ${activeTab === 'groups' ? '' : 'hidden'}`}
            >
                <GroupsDirectory />
            </div>
        </div>
    );
}
