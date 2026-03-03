import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter, ChevronDown, ChevronUp, Trophy, Home, TrendingUp, Pencil, Copy, Check, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import type { CompanyContactWithCounts, CompanyContactDetail } from "@/types/companies";
import type { PropertyFilters } from "@/types/filters";

type DirectorySortOption = "alphabetical" | "most-properties" | "fewest-properties" | "most-sold-properties" | "most-sold-properties-all-time" | "new-buyers";

const ALL_STATUS_FILTERS = ["in-renovation", "wholesale", "on-market", "sold"];
const DEFAULT_STATUS_FILTERS = ["in-renovation"];
const WHOLESALE_FEED_STATUS = ["wholesale"];
const BUYERS_FEED_STATUS = ["in-renovation", "wholesale"];

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

const contactRequestSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(10, "Message must be at least 10 characters").optional(),
});

type ContactRequestForm = z.infer<typeof contactRequestSchema>;

export type ViewMode = "map" | "grid" | "table" | "buyers-feed" | "wholesale";

interface CompanyDirectoryProps {
  onClose?: () => void;
  onSwitchToFilters?: () => void;
  // Accept null to indicate clearing the selection, and optional companyId
  onCompanySelect?: (companyName: string | null, companyId?: string | null) => void;
  // Controlled selected company so expanded state can be synced across views
  selectedCompany?: string | null;
  // Company ID when selected from PropertyDetailPanel, modal, card, etc. (enables fetch by ID)
  selectedCompanyId?: string | null;
  // Optional: allow syncing status filters with parent filters
  filters?: PropertyFilters;
  onFilterChange?: (filters: PropertyFilters) => void;
  /** Current view: on deselect we revert to feed-specific status (wholesale / buyers-feed) or in-renovation only */
  viewMode?: ViewMode;
}

export default function CompanyDirectory({ onClose, onSwitchToFilters, onCompanySelect, selectedCompany, selectedCompanyId: selectedCompanyIdProp, filters, onFilterChange, viewMode }: CompanyDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<DirectorySortOption>("most-properties");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters?.statusFilters ?? ["in-renovation"]));
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [editDialogCompanyId, setEditDialogCompanyId] = useState<string | null>(null);
  const [copiedCompanyId, setCopiedCompanyId] = useState<string | null>(null);
  const { isAdminOrOwner } = useAuth();

  // Keep expanded state in sync with parent's selectedCompany so it persists across view switches
  useEffect(() => {
    setExpandedCompany(selectedCompany ?? null);
  }, [selectedCompany]);

  // Sync local status filter UI when parent filters change
  useEffect(() => {
    if (!filters) return;
    setStatusFilters(new Set(filters.statusFilters ?? []));
  }, [filters]);

  // Refs to company DOM nodes so we can scroll them into view when selected
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousExpandedCompanyRef = useRef<string | null>(null);

  // When a company is selected: always turn on all status filters.
  // When deselected: revert to feed-specific status (wholesale feed → wholesale only; buyers feed → in-renovation + wholesale; map/grid/table → in-renovation only).
  useEffect(() => {
    const hadSelection = previousExpandedCompanyRef.current != null;
    const hasSelection = expandedCompany != null;
    previousExpandedCompanyRef.current = expandedCompany;

    if (hasSelection) {
      setStatusFilters(new Set(ALL_STATUS_FILTERS));
      if (onFilterChange && filters) {
        onFilterChange({ ...filters, statusFilters: ALL_STATUS_FILTERS });
      }
    } else if (hadSelection) {
      const statuses =
        viewMode === "wholesale"
          ? WHOLESALE_FEED_STATUS
          : viewMode === "buyers-feed"
            ? BUYERS_FEED_STATUS
            : DEFAULT_STATUS_FILTERS;
      setStatusFilters(new Set(statuses));
      if (onFilterChange && filters) {
        onFilterChange({ ...filters, statusFilters: statuses });
      }
    }
  }, [expandedCompany, viewMode]);

  // Scroll the selected/expanded company into view when it changes
  useEffect(() => {
    if (expandedCompany) {
      const el = itemRefs.current[expandedCompany];
      if (el) {
        // Slight timeout to ensure element is rendered and layout is settled
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
      }
    }
  }, [expandedCompany]);
  const { toast } = useToast();

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }

      // If parent provided a filter setter, update its statusFilters while preserving other values
      if (onFilterChange) {
        onFilterChange({
          minPrice: filters?.minPrice ?? 0,
          maxPrice: filters?.maxPrice ?? 10000000,
          bedrooms: filters?.bedrooms ?? 'Any',
          bathrooms: filters?.bathrooms ?? 'Any',
          propertyTypes: filters?.propertyTypes ?? [],
          zipCode: filters?.zipCode ?? '',
          statusFilters: Array.from(next),
        });
      }

      return next;
    });
  };

  const form = useForm<ContactRequestForm>({
    resolver: zodResolver(contactRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });


  // Fetch companies with property counts (calculated server-side from ALL properties)
  const countyQueryParam = filters?.county ? `?county=${encodeURIComponent(filters.county)}` : '';
  const { data: companies = [], isLoading } = useQuery<CompanyContactWithCounts[]>({
    queryKey: [`/api/companies/contacts${countyQueryParam}`],
    queryFn: async () => {
      const res = await fetch(`/api/companies/contacts${countyQueryParam}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch companies: ${res.status}`);
      }
      return res.json();
    },
  });

  // Companies already have counts from the API, so we can use them directly
  const companiesWithCounts = companies;

  const filteredCompanies = useMemo(() => {
    let filtered = companiesWithCounts.filter(company => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = (
          company.companyName.toLowerCase().includes(query) ||
          company?.contactName?.toLowerCase().includes(query) ||
          (company.contactEmail && company.contactEmail.toLowerCase().includes(query))
        );
        if (!matchesSearch) return false;
      }
      
      return true;
    });

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "alphabetical":
          return a.companyName.localeCompare(b.companyName);
        case "most-properties":
          return b.propertyCount - a.propertyCount;
        case "fewest-properties":
          return a.propertyCount - b.propertyCount;
        case "most-sold-properties":
          return (b.propertiesSoldCount ?? 0) - (a.propertiesSoldCount ?? 0);
        case "most-sold-properties-all-time":
          return (b.propertiesSoldCountAllTime ?? 0) - (a.propertiesSoldCountAllTime ?? 0);
        case "new-buyers":
          // Sort by property count (fallback since we don't have recentMonthPurchases)
          return b.propertyCount - a.propertyCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [companiesWithCounts, searchQuery, sortBy]);

  // Resolve the expanded company ID: from list when company is in filtered list, else from parent prop (e.g. PropertyDetailPanel, modal, card)
  const expandedCompanyId = expandedCompany
    ? (filteredCompanies.find((c) => c.companyName === expandedCompany)?.id ?? selectedCompanyIdProp ?? null)
    : null;

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

  // Calculate rankings based on property count (sorted by most properties)
  const companyRankings = useMemo(() => {
    const sorted = [...companiesWithCounts].sort((a, b) => b.propertyCount - a.propertyCount);
    const rankings: Record<string, number> = {};
    sorted.forEach((company, index) => {
      rankings[company.companyName] = index + 1;
    });
    return rankings;
  }, [companiesWithCounts]);

  const handleCompanyClick = (company: CompanyContactWithCounts) => {
    // Toggle expanded state and notify parent with the new state (null when collapsing)
    setExpandedCompany(prev => {
      const next = prev === company.companyName ? null : company.companyName;
      if (onCompanySelect) {
        onCompanySelect(next, next ? company.id : null);
      }
      return next;
    });
  };

  const handleContactRequest = (data: ContactRequestForm) => {
    const subject = "Contact Information Request";
    const body = 
      `Hello,\n\n` +
      `I would like to request contact information.\n\n` +
      `Name: ${data.name}\n` +
      `Email: ${data.email}\n` +
      `${data.message ? `Message: ${data.message}\n` : ''}` +
      `\nThank you.`;
    
    const mailtoLink = `mailto:neil@arvfinance.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Attempt to open mailto: link
    window.location.href = mailtoLink;
    
    // Show success message and close dialog
    toast({
      title: "Opening Email Client",
      description: "Your default email client will open. If it doesn't, please use the 'Copy Email' button to get the address.",
    });
    
    setRequestDialogOpen(false);
    form.reset();
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("neil@arvfinance.com").then(() => {
      toast({
        title: "Email Copied",
        description: "neil@arvfinance.com has been copied to your clipboard.",
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Please manually copy: neil@arvfinance.com",
        variant: "destructive",
      });
    });
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-directory-search"
          />
          {searchQuery && (
            <X 
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setSearchQuery("")}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Sort by:</span>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as DirectorySortOption)}>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading companies...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {searchQuery ? "No companies found" : "No companies in directory"}
          </div>
        ) : (
          filteredCompanies.map((company, index) => {
            const isExpanded = expandedCompany === company.companyName;
            const profile = companyProfiles[company.companyName];
            const ranking = companyRankings[company.companyName] || 0;
            
            return (
              <div key={company.id} ref={(el) => (itemRefs.current[company.companyName] = el)}>
                <Card
                  className={`p-3 hover-elevate active-elevate-2 cursor-pointer transition-all ${isExpanded ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handleCompanyClick(company)}
                  data-testid={`card-company-${company.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {(sortBy === "most-properties" || sortBy === "most-sold-properties" || sortBy === "most-sold-properties-all-time") && index < 25 && (
                          <span className="text-primary font-bold text-sm min-w-[24px]" data-testid={`text-rank-${index + 1}`}>
                            {index + 1}.
                          </span>
                        )}
                        <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm leading-tight break-words" data-testid="text-company-name">
                            {company.companyName}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {sortBy !== "most-sold-properties" && sortBy !== "most-sold-properties-all-time" && company.propertyCount > 0 && (
                          <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-property-count">
                            {company.propertyCount} {company.propertyCount === 1 ? 'property' : 'properties'}
                          </div>
                        )}
                        {sortBy === "most-sold-properties" && (company.propertiesSoldCount ?? 0) > 0 && (
                          <div className="text-xs font-medium text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-sold-count">
                            {company.propertiesSoldCount} sold
                          </div>
                        )}
                        {sortBy === "most-sold-properties-all-time" && (company.propertiesSoldCountAllTime ?? 0) > 0 && (
                          <div className="text-xs font-medium text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-sold-count-all-time">
                            {company.propertiesSoldCountAllTime} sold
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
                      {company.contactName && (
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                      <span className="truncate" data-testid="text-contact-name">{company.contactName}</span>
                    </div>
                  </div>
                </Card>
                
                {/* Expandable Profile Section */}
                {isExpanded && (
                  <div 
                    className="mt-1 mb-2 ml-4 p-3 bg-muted/50 rounded-md border border-border space-y-3"
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`profile-${company.id}`}
                  >
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Investor Profile
                    </div>
                    
                    {/* Properties Owned */}
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="font-semibold text-foreground">{company.propertyCount}</span>
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
                        <span className="font-bold text-primary">#{ranking}</span>
                      </span>
                    </div>
                    
                    {/* Principal - use profile override, or fall back to company contact name */}
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="text-sm">
                        <span className="text-muted-foreground">Principal: </span>
                        <span className="font-medium text-foreground">
                          {profile?.principal || company.contactName || "Not Available"}
                        </span>
                      </span>
                    </div>
                    
                    {/* Company Email */}
                    {company.contactEmail && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {company.contactEmail}
                        </span>
                      </div>
                    )}
                    
                    {/* Company Phone */}
                    {company.phoneNumber && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {company.phoneNumber}
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
                                  data={expandedCompanyDetail.acquisition90DayByMonth.map((m) => ({
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
                            setEditDialogCompanyId(company.id);
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
                            navigator.clipboard.writeText(company.companyName).then(() => {
                              setCopiedCompanyId(company.id);
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
                          {copiedCompanyId === company.id ? (
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
          // Optionally refresh the companies list
          queryClient.invalidateQueries({ queryKey: ["/api/companies/contacts"] });
        }}
      />

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {filteredCompanies.length} {filteredCompanies.length === 1 ? 'company' : 'companies'}
        </div>
      </div>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent data-testid="dialog-request-contact">
          <DialogHeader>
            <DialogTitle>Request Contact Information</DialogTitle>
            <DialogDescription>
              Send a contact information request to neil@arvfinance.com. Your default email client will open with a pre-filled message.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleContactRequest)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John Doe" data-testid="input-request-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Email *</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="john@example.com" data-testid="input-request-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Additional details..." data-testid="input-request-message" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="flex-1"
                    data-testid="button-submit-request"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Send Request
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyEmail}
                    className="flex-1"
                    data-testid="button-copy-email"
                  >
                    Copy Email
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRequestDialogOpen(false);
                    form.reset();
                  }}
                  className="w-full"
                  data-testid="button-cancel-request"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
