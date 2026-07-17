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
 * tabs and drive whichever tab is active. Both panels stay mounted (visibility toggled) so their
 * state/effects persist; switching tabs clears the active company selection (selections are mutually
 * exclusive). The Groups tab loads lazily on first switch and on any sort/search/county change.
 */
export function DirectoryPanel() {
    const {
        directorySort,
        directorySearch,
        setDirectorySort,
        setDirectorySearch,
        loadCompanies,
        company,
        setCompany,
    } = useCompanies();
    const { loadGroups } = useGroups();
    const { filters } = useFilters();
    const nav = useDataNav();

    const [activeTab, setActiveTab] = useState<DirectoryTab>('companies');
    const [searchInput, setSearchInput] = useState(directorySearch);
    const debouncedSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the shared input in sync when the search value changes elsewhere (e.g. programmatic reset).
    useEffect(() => {
        setSearchInput(directorySearch);
    }, [directorySearch]);

    // Apply a search value to the active tab. Companies load through loadCompanies; groups reload via
    // the effect below (keyed on directorySearch).
    const applySearch = useCallback(
        (value: string) => {
            if (activeTab === 'companies') loadCompanies({ search: value });
            else setDirectorySearch(value);
        },
        [activeTab, loadCompanies, setDirectorySearch],
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
                // Returning to Companies: reflect the current shared sort/search (they may have
                // changed while the Groups tab was active).
                loadCompanies({ sort: directorySort, search: directorySearch });
            }
        },
        [activeTab, company, setCompany, nav, loadCompanies, directorySort, directorySearch],
    );

    // Load the Groups tab lazily on first switch, and reload it on any sort/search/county change
    // while it is active. loadGroups de-duplicates unchanged params.
    useEffect(() => {
        if (activeTab !== 'groups') return;
        loadGroups({ sort: directorySort, search: directorySearch });
    }, [activeTab, filters.counties, directorySort, directorySearch, loadGroups]);

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
                                : 'Search groups...'
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
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Sort by:</span>
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
                            Companies
                        </TabsTrigger>
                        <TabsTrigger value="groups" data-testid="tab-groups">
                            Groups
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Both panels stay mounted; the inactive one is hidden to preserve its state and effects. */}
            <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'companies' ? '' : 'hidden'}`}>
                <CompanyDirectory />
            </div>
            <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'groups' ? '' : 'hidden'}`}>
                <GroupsDirectory />
            </div>
        </div>
    );
}
