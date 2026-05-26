import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, ChevronDown, ChevronUp, Trophy, Home, TrendingUp, Pencil, Copy, Check, Phone, Eye, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import AppDialog from "@/components/modals/Dialog";
import { UpdateCompanyDialog } from "../admin/UpdateCompanyDialog";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useFilters } from "@/hooks/useFilters";
import type { CompanyContactWithCounts, CompanyContactDetail, CompanyDirectoryProps } from "@/types/companies";
import { fetchCompanyById } from "@/api/companies.api";
import type { UpdateDialogInitialData } from "@/types/general";
import type { DirectorySortOption } from "@/types/options";
import {
  ALL_STATUS_FILTERS,
  BUYERS_FEED_STATUS_FILTERS,
  DEFAULT_STATUS_FILTERS,
  WHOLESALE_VIEW_STATUS_FILTERS,
} from "@/constants/propertyStatus.constants";
import { COUNTIES } from "@/constants/filters.constants";
import { useView } from "@/hooks/useView";
import { useCompanies } from "@/hooks/useCompanies";
import { useProperty } from "@/hooks/useProperty";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { formatCompanyName } from "@shared/utils/formatCompanyName";
import { useRequireSubscription } from "@/hooks/useRequireSubscription";
import { useDataNav } from "@/hooks/useDataNav";

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

export default function CompanyDirectory(_props: CompanyDirectoryProps) {
  const { filters, setFilters } = useFilters();
  const [searchInput, setSearchInput] = useState("");
  const [_statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters.statusFilters ?? DEFAULT_STATUS_FILTERS));
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [editDialogCompanyId, setEditDialogCompanyId] = useState<string | null>(null);
  const [editDialogInitialData, setEditDialogInitialData] = useState<UpdateDialogInitialData | null>(null);
  const [copiedCompanyId, setCopiedCompanyId] = useState<string | null>(null);
  const [enrichingCompanyId, setEnrichingCompanyId] = useState<string | null>(null);
  const enrichState = useMemo(
    () => COUNTIES.find((c) => c.county === (filters.county ?? "San Diego"))?.state ?? "CA",
    [filters.county]
  );
  const { isAdmin, isOwner } = useAuth();
  const { requireSubscription, ContactDialog } = useRequireSubscription();
  const { view, setView } = useView();
  const nav = useDataNav();
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
    loadCompanies,
    loadMoreCompanies,
    companySelectionInProgressRef,
    companyFiltersExpandedRef,
    ensuredCompany,
    updateCompanyInList,
  } = useCompanies();
  const { setProperty } = useProperty();
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const listScrollContainerRef = useRef<HTMLDivElement>(null);
  const filterResetHandledRef = useRef(false);

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

  // When a company is newly selected (from external sources like panel/modal): turn on all status filters and expand date range to all-time.
  // When deselected externally: revert to feed-specific status and restore default 60-day date window.
  // Note: click-initiated changes are handled directly in handleCompanyClick (batched) and skip this effect via filterResetHandledRef.
  useEffect(() => {
    const hadSelection = previousExpandedCompanyRef.current != null;
    const hasSelection = company != null;
    previousExpandedCompanyRef.current = company?.companyName ?? null;

    if (filterResetHandledRef.current) {
      filterResetHandledRef.current = false;
      return;
    }

    if (hasSelection) {
      // Expand filters when a new company is selected. Skip if same company (e.g. sidebar tab remount).
      if (companyFiltersExpandedRef.current !== (company?.id ?? null)) {
        companyFiltersExpandedRef.current = company?.id ?? null;
        setStatusFilters(new Set(ALL_STATUS_FILTERS));
        setFilters({ ...filters, statusFilters: ALL_STATUS_FILTERS, dateRange: "all-time" });
      }
    } else if (!hasSelection && hadSelection) {
      const statuses =
        view === "wholesale"
          ? WHOLESALE_VIEW_STATUS_FILTERS
          : view === "buyers-feed"
            ? BUYERS_FEED_STATUS_FILTERS
            : DEFAULT_STATUS_FILTERS;
      setStatusFilters(new Set(statuses));
      setFilters({
        ...filters,
        statusFilters: statuses,
        dateRange: "60d",
      });
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
      requireSubscription(() => {
        companySelectionInProgressRef.current = true;
        setCompany(next);
        setProperty(null);
        nav.setCompanyId(next.id);
      });
      return;
    } else {
      // Batch setCompany + setFilters in the same event handler so React processes them in a single render,
      // eliminating the two-render cycle (company=null render, then filter-change render) that caused visual lag.
      const statuses =
        view === "wholesale"
          ? WHOLESALE_VIEW_STATUS_FILTERS
          : view === "buyers-feed"
            ? BUYERS_FEED_STATUS_FILTERS
            : DEFAULT_STATUS_FILTERS;
      filterResetHandledRef.current = true;
      companySelectionInProgressRef.current = false;
      setStatusFilters(new Set(statuses));
      setFilters({
        ...filters,
        statusFilters: statuses,
        dateRange: "60d",
      });
      setCompany(null);
      nav.setCompanyId(null);
      // If directory was opened via wholesaler/panel/modal click, we may have skipped the initial load; load now so list isn't empty
      if (companies.length === 0) {
        loadCompanies();
      }
    }
  };

  const handleEnrichCompany = async (companyId: string) => {
    if (enrichingCompanyId) return;
    setEnrichingCompanyId(companyId);
    try {
      await apiRequest("POST", `/api/companies/${companyId}/enrich`, { state: enrichState });
      toast({ title: "Company data loaded", description: "OpenCorporates data saved successfully" });
      // Refresh the expanded profile panel immediately
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId] });
      // Patch the contact name in the list card without a full reload
      const fresh = await fetchCompanyById(companyId, { county: filters.county ?? undefined });
      if (fresh?.contactName) updateCompanyInList(companyId, { contactName: fresh.contactName });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "An error occurred";
      // apiRequest error format is "status: body" — extract the body JSON message if present
      const bodyPart = raw.includes(": ") ? raw.split(": ").slice(1).join(": ") : raw;
      let displayMessage = bodyPart;
      try {
        const parsed = JSON.parse(bodyPart);
        if (parsed?.message) displayMessage = parsed.message;
      } catch { /* not JSON, use as-is */ }
      toast({ title: "Failed to load company data", description: displayMessage, variant: "destructive" });
    } finally {
      setEnrichingCompanyId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-background flex flex-col overflow-hidden" data-testid="sidebar-directory">

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
<SelectItem value="most-properties" data-testid="sort-most-properties">
                Most Properties Owned
              </SelectItem>
<SelectItem value="most-sold-properties" data-testid="sort-most-sold-properties">
                Most Sold Properties (YTD)
              </SelectItem>
              <SelectItem value="most-sold-properties-all-time" data-testid="sort-most-sold-properties-all-time">
                Most Sold Properties (All-Time)
              </SelectItem>
              <SelectItem value="most-bought-properties" data-testid="sort-most-bought-properties">
                Most Bought Properties (YTD)
              </SelectItem>
              <SelectItem value="most-bought-properties-all-time" data-testid="sort-most-bought-properties-all-time">
                Most Bought Properties (All-Time)
              </SelectItem>
              {/* <SelectItem value="new-buyers" data-testid="sort-new-buyers">
                New Buyers
              </SelectItem> */}
              <SelectItem value="buys-wholesale" data-testid="sort-buys-wholesale">
                Buys from Wholesalers
              </SelectItem>
              <SelectItem value="wholesalers" data-testid="sort-wholesalers">
                Wholesalers
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
            const medalBorder =
              ranking === 1
                ? "border-l-4 border-l-amber-400"
                : ranking === 2
                  ? "border-l-4 border-l-slate-400"
                  : ranking === 3
                    ? "border-l-4 border-l-amber-700"
                    : "";

            return (
              <div key={listCompany.id} ref={(el) => (itemRefs.current[listCompany.companyName] = el)}>
                <Card
                  className={`p-3 hover-elevate active-elevate-2 cursor-pointer transition-all ${isExpanded ? 'ring-2 ring-primary' : ''} ${medalBorder}`}
                  onClick={() => handleCompanyClick(listCompany)}
                  data-testid={`card-company-${listCompany.id}`}
                >
                  <div className="flex items-center gap-2">
                    {/* Col 1: Rank (fixed small width) */}
                    <div className="flex-shrink-0 w-5 flex items-center justify-center">
                      {ranking != null && (
                        ranking <= 3 ? (
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              ranking === 1
                                ? "bg-amber-400 text-white"
                                : ranking === 2
                                  ? "bg-slate-400 text-white"
                                  : "bg-amber-700 text-amber-100"
                            }`}
                            data-testid={`text-rank-${ranking}`}
                          >
                            {ranking}
                          </span>
                        ) : (
                          <span className="text-primary font-bold text-sm leading-tight" data-testid={`text-rank-${ranking}`}>
                            {ranking}.
                          </span>
                        )
                      )}
                    </div>

                    {/* Col 2: Company name + contact (flex-1, truncates) */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="font-medium text-sm leading-tight break-words" data-testid="text-company-name">
                        {formatCompanyName(listCompany.companyName)}
                      </div>
                      {listCompany.contactName && (
                        <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                          <User className="w-3 h-3 flex-shrink-0" />
                          <span className="text-sm truncate" data-testid="text-contact-name">{listCompany.contactName}</span>
                        </div>
                      )}
                    </div>

                    {/* Col 3: Count + ARV Partner badges */}
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      {sortBy !== "most-sold-properties" && sortBy !== "most-sold-properties-all-time" && sortBy !== "most-bought-properties" && sortBy !== "most-bought-properties-all-time" && sortBy !== "buys-wholesale" && sortBy !== "wholesalers" && listCompany.propertyCount > 0 && (
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
                      {sortBy === "most-bought-properties" && (listCompany.propertiesBoughtCount ?? 0) > 0 && (
                        <div className="text-xs font-medium text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-bought-count">
                          {listCompany.propertiesBoughtCount} bought
                        </div>
                      )}
                      {sortBy === "most-bought-properties-all-time" && (listCompany.propertiesBoughtCountAllTime ?? 0) > 0 && (
                        <div className="text-xs font-medium text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-bought-count-all-time">
                          {listCompany.propertiesBoughtCountAllTime} bought
                        </div>
                      )}
                      {sortBy === "buys-wholesale" && (listCompany.wholesaleBuyCount ?? 0) > 0 && (
                        <div className="text-xs font-medium text-purple-600 bg-purple-500/15 dark:text-purple-400 dark:bg-purple-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-wholesale-buy-count">
                          {listCompany.wholesaleBuyCount} wholesale
                        </div>
                      )}
                      {sortBy === "wholesalers" && (listCompany.wholesalerCount ?? 0) > 0 && (
                        <div className="text-xs font-medium text-purple-600 bg-purple-500/15 dark:text-purple-400 dark:bg-purple-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-wholesaler-count">
                          {listCompany.wholesalerCount} wholesales
                        </div>
                      )}
                      {listCompany.isFinancedByARV && (
                        <div className="text-xs font-medium text-black bg-white px-2 py-0.5 rounded-full whitespace-nowrap">
                          ARV Partner
                        </div>
                      )}
                    </div>

                    {/* Col 4: Chevron (fixed small width) */}
                    <div className="flex-shrink-0 flex items-center">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
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
                        <span className="font-semibold text-foreground">{expandedCompanyDetail?.propertyCount ?? listCompany.propertyCount}</span>
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
                                    cursor={false}
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

                    {/* View Properties — visible to all users */}
                    <div className="pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setView("grid");
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Properties
                      </Button>
                    </div>

                    {/* Admin Actions - Only visible to owner or admin */}
                    {(isAdmin || isOwner) && (
                      <div className="pt-3 border-t border-border space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          disabled={enrichingCompanyId === listCompany.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEnrichCompany(listCompany.id);
                          }}
                          data-testid="button-enrich-company"
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${enrichingCompanyId === listCompany.id ? "animate-spin" : ""}`} />
                          {enrichingCompanyId === listCompany.id ? "Loading..." : "Load Company Data"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditDialogCompanyId(listCompany.id);
                            setEditDialogInitialData({
                              companyName: listCompany.companyName,
                              isArvClient: listCompany.isArvClient ?? false,
                            });
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
      <AppDialog
        open={updateDialogOpen}
        onClose={() => {
          setUpdateDialogOpen(false);
          setEditDialogCompanyId(null);
          setEditDialogInitialData(null);
        }}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {updateDialogOpen && (
          <UpdateCompanyDialog
            onClose={() => {
              setUpdateDialogOpen(false);
              setEditDialogCompanyId(null);
              setEditDialogInitialData(null);
            }}
            companyId={editDialogCompanyId}
            initialData={editDialogInitialData}
            onSuccess={() => loadCompanies({ force: true })}
          />
        )}
      </AppDialog>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {total} {total === 1 ? "company" : "companies"}
        </div>
      </div>

      {ContactDialog}
    </div>
  );
}
