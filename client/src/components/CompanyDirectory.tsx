import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter } from "lucide-react";
import { CompanyContact, Property } from "@shared/schema";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DirectorySortOption = "alphabetical" | "most-properties" | "fewest-properties";

interface CompanyDirectoryProps {
  onClose?: () => void;
  onSwitchToFilters?: () => void;
  onCompanySelect?: (companyName: string) => void;
}

export default function CompanyDirectory({ onClose, onSwitchToFilters, onCompanySelect }: CompanyDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<DirectorySortOption>("alphabetical");

  const { data: companies = [], isLoading } = useQuery<CompanyContact[]>({
    queryKey: ["/api/company-contacts"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Calculate property counts for each company
  const companiesWithCounts = useMemo(() => {
    return companies.map(company => {
      const propertyCount = properties.filter(
        p => p.propertyOwner === company.companyName
      ).length;
      return { ...company, propertyCount };
    });
  }, [companies, properties]);

  const filteredCompanies = useMemo(() => {
    let filtered = companiesWithCounts.filter(company => {
      if (!searchQuery.trim()) return true;
      
      const query = searchQuery.toLowerCase();
      return (
        company.companyName.toLowerCase().includes(query) ||
        company.contactName.toLowerCase().includes(query) ||
        (company.contactEmail && company.contactEmail.toLowerCase().includes(query))
      );
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
        default:
          return 0;
      }
    });

    return filtered;
  }, [companiesWithCounts, searchQuery, sortBy]);

  const handleCompanyClick = (companyName: string) => {
    if (onCompanySelect) {
      onCompanySelect(companyName);
    }
  };

  return (
    <div className="w-80 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-directory">
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
              Directory
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
          filteredCompanies.map((company) => (
            <Card
              key={company.id}
              className="p-3 hover-elevate active-elevate-2 cursor-pointer transition-all"
              onClick={() => handleCompanyClick(company.companyName)}
              data-testid={`card-company-${company.id}`}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm leading-tight break-words" data-testid="text-company-name">
                        {company.companyName}
                      </div>
                    </div>
                  </div>
                  {company.propertyCount > 0 && (
                    <div className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="text-property-count">
                      {company.propertyCount} {company.propertyCount === 1 ? 'property' : 'properties'}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-3.5 h-3.5 flex-shrink-0" />
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
          ))
        )}
      </div>

      <div className="p-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {filteredCompanies.length} {filteredCompanies.length === 1 ? 'company' : 'companies'}
        </div>
      </div>
    </div>
  );
}
