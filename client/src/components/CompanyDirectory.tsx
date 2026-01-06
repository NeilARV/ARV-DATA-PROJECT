import { useState, useMemo, useEffect, useRef } from "react";
import type { PropertyFilters } from "@/components/FilterSidebar";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter, ChevronDown, ChevronUp, Trophy, Home, TrendingUp } from "lucide-react";
import { CompanyContact, Property } from "@shared/schema";

// Extended CompanyContact type with property counts from API
type CompanyContactWithCounts = CompanyContact & {
  propertyCount: number;
};
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { parseISO, isValid, format, isAfter } from "date-fns";
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

type DirectorySortOption = "alphabetical" | "most-properties" | "fewest-properties" | "new-buyers";

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

interface CompanyDirectoryProps {
  onClose?: () => void;
  onSwitchToFilters?: () => void;
  // Accept null to indicate clearing the selection
  onCompanySelect?: (companyName: string | null) => void;
  // Controlled selected company so expanded state can be synced across views
  selectedCompany?: string | null;
  // Optional: allow syncing status filters with parent filters
  filters?: PropertyFilters;
  onFilterChange?: (filters: PropertyFilters) => void;
}

export default function CompanyDirectory({ onClose, onSwitchToFilters, onCompanySelect, selectedCompany, filters, onFilterChange }: CompanyDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<DirectorySortOption>("most-properties");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters?.statusFilters ?? ["in-renovation"]));

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

  // Fetch properties only for the 90-day chart (needs monthly breakdown)
  // The main property counts come from the companies API response above
  const { data: propertiesResponse } = useQuery<{ properties: Property[]; total: number; hasMore: boolean }>({
    queryKey: [`/api/properties${countyQueryParam}`],
    queryFn: async () => {
      const res = await fetch(`/api/properties${countyQueryParam}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch properties: ${res.status}`);
      }
      return res.json();
    },
  });

  const properties = propertiesResponse?.properties ?? [];

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
        case "new-buyers":
          // Sort by property count (fallback since we don't have recentMonthPurchases)
          return b.propertyCount - a.propertyCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [companiesWithCounts, searchQuery, sortBy]);

  // Calculate rankings based on property count (sorted by most properties)
  const companyRankings = useMemo(() => {
    const sorted = [...companiesWithCounts].sort((a, b) => b.propertyCount - a.propertyCount);
    const rankings: Record<string, number> = {};
    sorted.forEach((company, index) => {
      rankings[company.companyName] = index + 1;
    });
    return rankings;
  }, [companiesWithCounts]);

  const handleCompanyClick = (companyName: string) => {
    // Toggle expanded state and notify parent with the new state (null when collapsing)
    setExpandedCompany(prev => {
      const next = prev === companyName ? null : companyName;
      if (onCompanySelect) {
        onCompanySelect(next);
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
        <div className="flex items-center justify-between mb-3">
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
                  onClick={() => handleCompanyClick(company.companyName)}
                  data-testid={`card-company-${company.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {sortBy === "most-properties" && index < 25 && (
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
                      <div className="flex items-center gap-2">
                        {company.propertyCount > 0 && (
                          <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-property-count">
                            {company.propertyCount} {company.propertyCount === 1 ? 'property' : 'properties'}
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
                    
                    {company.contactEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                        <a
                          href={`mailto:${company.contactEmail}`}
                          className="text-primary hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                          data-testid="link-contact-email"
                        >
                          {company.contactEmail}
                        </a>
                      </div>
                    )}
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
                        <span className="italic text-muted-foreground">Coming Soon</span>
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
                    
                    {/* 90-Day Acquisition Activity */}
                    {(() => {
                      const companyNameNormalized = company.companyName.trim().toLowerCase();
                      const now = new Date();
                      
                      // Get the last 3 complete months (excluding current month)
                      // In December, show Sep, Oct, Nov
                      const months: { key: string; start: Date; end: Date }[] = [];
                      for (let i = 3; i >= 1; i--) {
                        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
                        months.push({
                          key: format(monthDate, 'MMM'),
                          start: monthDate,
                          end: monthEnd
                        });
                      }
                      
                      // Get properties for this company in the last 3 complete months
                      const threeMonthsAgo = months[0].start;
                      const endOfLastMonth = months[2].end;
                      
                      // Normalize county filter for comparison (case-insensitive, trimmed)
                      const selectedCountyNormalized = filters?.county 
                        ? filters.county.trim().toLowerCase() 
                        : null;
                      
                      const companyProperties = properties.filter(p => {
                        const ownerName = (p.propertyOwner ?? "").trim().toLowerCase();
                        if (ownerName !== companyNameNormalized) return false;
                        
                        // If county filter is selected, also filter by county
                        if (selectedCountyNormalized) {
                          const propertyCounty = (p.county ?? "").trim().toLowerCase();
                          if (propertyCounty !== selectedCountyNormalized) return false;
                        }
                        
                        if (!p.dateSold) return false;
                        try {
                          const date = parseISO(p.dateSold);
                          return isValid(date) && isAfter(date, threeMonthsAgo) && !isAfter(date, endOfLastMonth);
                        } catch {
                          return false;
                        }
                      });
                      
                      // Group by month
                      const monthlyData: Record<string, number> = {};
                      months.forEach(m => {
                        monthlyData[m.key] = 0;
                      });
                      
                      companyProperties.forEach(p => {
                        if (p.dateSold) {
                          try {
                            const date = parseISO(p.dateSold);
                            if (isValid(date)) {
                              const monthKey = format(date, 'MMM');
                              if (monthlyData[monthKey] !== undefined) {
                                monthlyData[monthKey]++;
                              }
                            }
                          } catch {}
                        }
                      });
                      
                      const chartData = months.map(m => ({
                        month: m.key,
                        count: monthlyData[m.key]
                      }));
                      
                      const totalLast90Days = companyProperties.length;
                      const avgPerMonth = totalLast90Days > 0 ? (totalLast90Days / 3).toFixed(1) : "0";
                      
                      return (
                        <div className="space-y-2 pt-2 border-t border-border">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">90-Day Acquisition Activity</span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Last 90 days: </span>
                              <span className="font-semibold text-foreground">{totalLast90Days}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Avg/month: </span>
                              <span className="font-semibold text-foreground">{avgPerMonth}</span>
                            </div>
                          </div>
                          
                          {totalLast90Days > 0 ? (
                            <div className="h-20 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                  <XAxis 
                                    dataKey="month" 
                                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis hide />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'hsl(var(--background))',
                                      border: '1px solid hsl(var(--border))',
                                      borderRadius: '6px',
                                      fontSize: '12px'
                                    }}
                                    formatter={(value: number) => [`${value} properties`, 'Acquired']}
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
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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
