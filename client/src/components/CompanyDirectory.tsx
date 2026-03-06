import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter, ChevronDown, ChevronUp, Trophy, Home, TrendingUp, Pencil, Copy, Check, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import UpdateDialog from "@/components/modals/UpdateDialog";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFilters } from "@/hooks/useFilters";
import type { CompanyContactWithCounts, CompanyContactDetail, CompanyDirectoryProps } from "@/types/companies";
import type { DirectorySortOption } from "@/types/options";
import {
  ALL_STATUS_FILTERS,
  BUYERS_FEED_STATUS_FILTERS,
  DEFAULT_STATUS_FILTERS,
  WHOLESALE_VIEW_STATUS_FILTERS,
} from "@/constants/propertyStatus.constants";
import { useView } from "@/hooks/useView";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

// Profile data for known companies
const companyProfiles: Record<string, {
  principal?: string;
  acquisitionsAssociate?: string;
  acquisitionsAssociateEmail?: string;
}> = {
  "New Beginnings Ventures LLC": {
    principal: "Josh Stech",
    acquisitionsAssociate: "Christian Galino",
    acquisitionsAssociateEmail: "cgalindo@sundae.com",
  },
  // Add more company profiles here as needed
};

const SEARCH_DEBOUNCE_MS = 300;

export default function CompanyDirectory({ onClose, onSwitchToFilters }: CompanyDirectoryProps) {
  const { filters, setFilters } = useFilters();
  const [searchInput, setSearchInput] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters.statusFilters ?? DEFAULT_STATUS_FILTERS));
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [editDialogCompanyId, setEditDialogCompanyId] = useState<string | null>(null);
  const [copiedCompanyId, setCopiedCompanyId] = useState<string | null>(null);
  const { isAdminOrOwner } = useAuth();
  const { view } = useView();
  const {
    company,
    setCompany,
    companies,
    total,
    hasMore,
    isLoadingCompanies: isLoading,
    isLoadingMoreCompanies: isLoadingMore,
    directorySort: sortBy,
    directorySearch,
    setDirectorySort,
    setDirectorySearch,
    loadCompanies,
    loadMoreCompanies,
    companySelectionInProgressRef,
    ensuredCompany,
  } = useCompanies();
  const { setProperty } = useProperty();
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const listScrollContainerRef = useRef<HTMLDivElement>(null);

  // Sync local search input with context (for controlled input) and debounce server search
  useEffect(() => {
    setSearchInput(directorySearch);
  }, [directorySearch]);

  const debouncedSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debouncedSearchRef.current) clearTimeout(debouncedSearchRef.current);
      debouncedSearchRef.current = setTimeout(() => {
        loadCompanies({ search: value });
        debouncedSearchRef.current = null;
      }, SEARCH_DEBOUNCE_MS);
    },
    [loadCompanies]
  );

  const handleSortChange = useCallback(
    (sort: DirectorySortOption) => {
      loadCompanies({ sort });
    },
    [loadCompanies]
  );

  useInfiniteScroll({
    ref: scrollSentinelRef,
    hasMore,
    loading: isLoadingMore,
    onLoadMore: loadMoreCompanies,
    enabled: !isLoading,
    useScrollableRoot: true,
    deps: [companies.length],
  });

  // Sync local status filter UI when context filters change
  useEffect(() => {
    setStatusFilters(new Set(filters.statusFilters ?? []));
  }, [filters]);

  // Refs to company DOM nodes so we can scroll them into view when selected
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousExpandedCompanyRef = useRef<string | null>(null);

  // When a company is selected: always turn on all status filters.
  // When deselected: revert to feed-specific status (wholesale feed → wholesale only; buyers feed → in-renovation + wholesale; map/grid/table → in-renovation only).
  useEffect(() => {
    const hadSelection = previousExpandedCompanyRef.current != null;
    const hasSelection = company != null;
    previousExpandedCompanyRef.current = company?.companyName ?? null;

    if (hasSelection) {
      setStatusFilters(new Set(ALL_STATUS_FILTERS));
      setFilters({ ...filters, statusFilters: ALL_STATUS_FILTERS });
    } else if (hadSelection) {
      const statuses =
        view === "wholesale"
          ? WHOLESALE_VIEW_STATUS_FILTERS
          : view === "buyers-feed"
            ? BUYERS_FEED_STATUS_FILTERS
            : DEFAULT_STATUS_FILTERS;
      setStatusFilters(new Set(statuses));
      setFilters({ ...filters, statusFilters: statuses });
    }
  }, [company, view]);

  // Scroll the selected company into view when it changes. When it's the ensured company (just loaded from panel/modal/wholesale), scroll list to top so it's visible.
  useEffect(() => {
    const companyName = company?.companyName;
    if (!companyName) return;
    const isEnsured = ensuredCompany != null && company.id === ensuredCompany.id;
    setTimeout(() => {
      if (isEnsured && listScrollContainerRef.current) {
        listScrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      const el = itemRefs.current[companyName];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: isEnsured ? "start" : "center" });
      }
    }, 0);
  }, [company?.id, company?.companyName, ensuredCompany?.id]);
  const { toast } = useToast();

  // Display list: ensured company (from panel/modal selection) when not already in paginated list, then companies
  const displayList = useMemo(() => {
    if (ensuredCompany && !companies.some((c) => c.id === ensuredCompany.id)) {
      return [ensuredCompany, ...companies];
    }
    return companies;
  }, [ensuredCompany, companies]);

  const expandedCompanyId = company?.id ?? null;

  // Fetch company details by ID when expanded (dropdown, auto-scroll from property panel, modal, card, etc.)
  const { data: expandedCompanyDetail } = useQuery<CompanyContactDetail>({
    queryKey: ["/api/companies", expandedCompanyId],
    queryFn: async () => {
      if (!expandedCompanyId) return null as unknown as CompanyContactDetail;
      const res = await fetch(`/api/companies/${expandedCompanyId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to fetch company: ${res.status}`);
      return res.json();
    },
    enabled: !!expandedCompanyId,
  });

  // Rank in list (backend returns sorted; position = rank for this view)
  const getRank = useCallback((index: number, listCompany: CompanyContactWithCounts) => {
    if (ensuredCompany && listCompany.id === ensuredCompany.id) return undefined;
    return index + 1;
  }, [ensuredCompany]);

  const handleCompanyClick = (clickedCompany: CompanyContactWithCounts) => {
    const next = company?.id === clickedCompany.id ? null : clickedCompany;
    if (next) {
      companySelectionInProgressRef.current = true;
      setCompany(next);
      setProperty(null);
    } else {
      companySelectionInProgressRef.current = false;
      setCompany(null);
      // If directory was opened via wholesaler/panel/modal click, we may have skipped the initial load; load now so list isn't empty
      if (companies.length === 0) {
        loadCompanies();
      }
    }
  };

  return (
    <div className="w-[375px] flex-shrink-0 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-directory">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {onSwitchToFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onSwitchToFilters}
                data-testid="button-tab-filters"
              >
                <Filter className="w-4 h-4 mr-1" />
                Filters
              </Button>
            )}
            <Button variant="default" size="sm" data-testid="button-tab-directory">
              Investor Profiles
            </Button>
          </div>
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-directory">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search companies or contacts..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
            data-testid="input-directory-search"
          />
          {searchInput && (
            <X
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors"
              onClick={() => {
                setSearchInput("");
                loadCompanies({ search: "" }); // explicitly load all so context directorySearch and list update
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sort by:</span>
          <Select value={sortBy} onValueChange={(value) => handleSortChange(value as DirectorySortOption)}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-directory-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alphabetical" data-testid="sort-alphabetical">
                Alphabetical
              </SelectItem>
              <SelectItem value="most-properties" data-testid="sort-most-properties">
                Most Properties
              </SelectItem>
              <SelectItem value="fewest-properties" data-testid="sort-fewest-properties">
                Fewest Properties
              </SelectItem>
              <SelectItem value="most-sold-properties" data-testid="sort-most-sold-properties">
                Most Sold Properties (YTD)
              </SelectItem>
              <SelectItem value="most-sold-properties-all-time" data-testid="sort-most-sold-properties-all-time">
                Most Sold Properties (All-Time)
              </SelectItem>
              <SelectItem value="new-buyers" data-testid="sort-new-buyers">
                New Buyers
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={listScrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading companies...
          </div>
        ) : displayList.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {directorySearch ? "No companies found" : "No companies in directory"}
          </div>
        ) : (
          displayList.map((listCompany, index) => {
            const isExpanded = company?.id === listCompany.id;
            const profile = companyProfiles[listCompany.companyName];
            const ranking = getRank(index, listCompany);
            
            return (
              <div key={listCompany.id} ref={(el) => (itemRefs.current[listCompany.companyName] = el)}>
                <Card
                  className={`p-3 hover-elevate active-elevate-2 cursor-pointer transition-all ${isExpanded ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleCompanyClick(listCompany)}
                  data-testid={`card-company-${listCompany.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {(sortBy === "most-properties" || sortBy === "most-sold-properties" || sortBy === "most-sold-properties-all-time") && ranking != null && (
                          <span className="text-primary font-bold text-sm min-w-[24px]" data-testid={`text-rank-${ranking}`}>
                            {ranking}.
                          </span>
                        )}
                        <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm leading-tight break-words" data-testid="text-company-name">
                            {listCompany.companyName}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {sortBy !== "most-sold-properties" && sortBy !== "most-sold-properties-all-time" && listCompany.propertyCount > 0 && (
                          <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-property-count">
                            {listCompany.propertyCount} {listCompany.propertyCount === 1 ? 'property' : 'properties'}
                          </div>
                        )}
                        {sortBy === "most-sold-properties" && (listCompany.propertiesSoldCount ?? 0) > 0 && (
                          <div className="text-xs font-medium text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-sold-count">
                            {listCompany.propertiesSoldCount} sold
                          </div>
                        )}
                        {sortBy === "most-sold-properties-all-time" && (listCompany.propertiesSoldCountAllTime ?? 0) > 0 && (
                          <div className="text-xs font-medium text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-sold-count-all-time">
                            {listCompany.propertiesSoldCountAllTime} sold
                          </div>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {listCompany.contactName && (
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span className="truncate" data-testid="text-contact-name">{listCompany.contactName}</span>
                    </div>
                  </div>
                </Card>
                
                {/* Expandable Profile Section */}
                {isExpanded && (
                  <div 
                    className="mt-1 mb-2 ml-4 p-3 bg-muted/50 rounded-md border border-border space-y-3"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`profile-${listCompany.id}`}
                  >
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Investor Profile
                    </div>
                    
                    {/* Properties Owned */}
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="font-semibold text-foreground">{listCompany.propertyCount}</span>
                        <span className="text-muted-foreground"> Properties Owned</span>
                      </span>
                    </div>
                    
                    {/* YTD Properties Sold */}
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="text-muted-foreground">YTD Properties Sold: </span>
                        {expandedCompanyDetail?.propertiesSoldCount !== undefined ? (
                          <span className="font-semibold text-foreground">{expandedCompanyDetail.propertiesSoldCount}</span>
                        ) : (
                          <span className="italic text-muted-foreground">Loading...</span>
                        )}
                      </span>
                    </div>
                    
                    {/* Market Ranking */}
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="text-muted-foreground">Market Ranking: </span>
                        <span className="font-bold text-primary">{ranking != null ? `#${ranking}` : "—"}</span>
                      </span>
                    </div>
                    
                    {/* Principal - use profile override, or fall back to company contact name */}
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="text-muted-foreground">Principal: </span>
                        <span className="font-medium text-foreground">
                          {profile?.principal || listCompany.contactName || "Not Available"}
                        </span>
                      </span>
                    </div>
                    
                    {/* Company Email */}
                    {listCompany.contactEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {listCompany.contactEmail}
                        </span>
                      </div>
                    )}
                    
                    {/* Company Phone */}
                    {listCompany.phoneNumber && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {listCompany.phoneNumber}
                        </span>
                      </div>
                    )}
                    
                    {/* Acquisitions Associate */}
                    {profile?.acquisitionsAssociate && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-primary" />
                          <span className="text-sm">
                            <span className="text-muted-foreground">Acquisitions Associate: </span>
                            <span className="font-medium text-foreground">{profile.acquisitionsAssociate}</span>
                          </span>
                        </div>
                        {profile.acquisitionsAssociateEmail && (
                          <div className="flex items-center gap-2 ml-6">
                            <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                            <a
                              href={`mailto:${profile.acquisitionsAssociateEmail}`}
                              className="text-sm text-primary hover:underline"
                              data-testid="link-acquisitions-email"
                            >
                              {profile.acquisitionsAssociateEmail}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 90-Day Acquisition Activity (from property_transactions API) */}
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">90-Day Acquisition Activity</span>
                      </div>
                      
                      {expandedCompanyDetail?.acquisition90DayTotal !== undefined ? (
                        <>
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Last 90 days: </span>
                              <span className="font-semibold text-foreground">{expandedCompanyDetail.acquisition90DayTotal}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Avg/month: </span>
                              <span className="font-semibold text-foreground">
                                {expandedCompanyDetail.acquisition90DayTotal > 0
                                  ? (expandedCompanyDetail.acquisition90DayTotal / 3).toFixed(1)
                                  : "0"}
                              </span>
                            </div>
                          </div>
                          
                          {expandedCompanyDetail.acquisition90DayTotal > 0 &&
                          expandedCompanyDetail.acquisition90DayByMonth?.length ? (
                            <div className="h-20 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={expandedCompanyDetail.acquisition90DayByMonth.map((m: { key: string; count: number }) => ({
                                    month: m.key,
                                    count: m.count,
                                  }))}
                                  margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                                >
                                  <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis hide />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: "hsl(var(--background))",
                                      border: "1px solid hsl(var(--border))",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                    }}
                                    formatter={(value: number) => [`${value} properties`, "Acquired"]}
                                  />
                                  <Bar
                                    dataKey="count"
                                    fill="hsl(var(--primary))"
                                    radius={[4, 4, 0, 0]}
                                  />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic">
                              No acquisitions in the last 90 days
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">Loading...</div>
                      )}
                    </div>
                    
                    {/* Admin Actions - Only visible to owner or admin */}
                    {isAdminOrOwner && (
                      <div className="pt-3 border-t border-border space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditDialogCompanyId(listCompany.id);
                            setUpdateDialogOpen(true);
                          }}
                          data-testid="button-edit-company"
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(listCompany.companyName).then(() => {
                              setCopiedCompanyId(listCompany.id);
                              toast({
                                title: "Copied",
                                description: "Company name copied to clipboard",
                              });
                              // Reset after 2 seconds
                              setTimeout(() => {
                                setCopiedCompanyId(null);
                              }, 2000);
                            }).catch(() => {
                              toast({
                                title: "Copy Failed",
                                description: "Failed to copy company name",
                                variant: "destructive",
                              });
                            });
                          }}
                          data-testid="button-copy-company-name"
                        >
                          {copiedCompanyId === listCompany.id ? (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4 mr-2" />
                              Copy Company Name
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        {hasMore && <div ref={scrollSentinelRef} className="h-4 flex-shrink-0" aria-hidden />}
        {isLoadingMore && (
          <div className="text-center text-muted-foreground py-4 text-sm">Loading more...</div>
        )}
      </div>

      {/* Update Company Dialog */}
      <UpdateDialog
        open={updateDialogOpen}
        onClose={() => {
          setUpdateDialogOpen(false);
          setEditDialogCompanyId(null);
        }}
        companyId={editDialogCompanyId}
        onSuccess={() => {
          loadCompanies();
        }}
      />

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {total} {total === 1 ? "company" : "companies"}
        </div>
      </div>
    </div>
  );
}
