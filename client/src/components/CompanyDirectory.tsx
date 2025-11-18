import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter } from "lucide-react";
import { CompanyContact } from "@shared/schema";
import { Card } from "@/components/ui/card";

interface CompanyDirectoryProps {
  onClose?: () => void;
  onSwitchToFilters?: () => void;
}

export default function CompanyDirectory({ onClose, onSwitchToFilters }: CompanyDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: companies = [], isLoading } = useQuery<CompanyContact[]>({
    queryKey: ["/api/company-contacts"],
  });

  const filteredCompanies = companies.filter(company => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      company.companyName.toLowerCase().includes(query) ||
      company.contactName.toLowerCase().includes(query) ||
      (company.contactEmail && company.contactEmail.toLowerCase().includes(query))
    );
  });

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

      <div className="p-4 border-b border-border">
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
              data-testid={`card-company-${company.id}`}
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-tight break-words" data-testid="text-company-name">
                      {company.companyName}
                    </div>
                  </div>
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
