import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Building2, Mail, User, Search, Filter, MessageSquare, ChevronDown, ChevronUp, Trophy, Home, ExternalLink } from "lucide-react";
import { SiInstagram, SiLinkedin, SiFacebook } from "react-icons/si";
import { CompanyContact, Property } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

type DirectorySortOption = "alphabetical" | "most-properties" | "fewest-properties";

// Social media and profile data for known companies
const companyProfiles: Record<string, {
  instagram?: string;
  linkedin?: string;
  facebook?: string;
  website?: string;
  acquisitionsAssociate?: string;
  acquisitionsAssociateEmail?: string;
}> = {
  "New Beginnings Ventures LLC": {
    instagram: "https://www.instagram.com/sundaehq/?hl=en",
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
  onCompanySelect?: (companyName: string) => void;
}

export default function CompanyDirectory({ onClose, onSwitchToFilters, onCompanySelect }: CompanyDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<DirectorySortOption>("most-properties");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<ContactRequestForm>({
    resolver: zodResolver(contactRequestSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
    },
  });

  const { data: companies = [], isLoading } = useQuery<CompanyContact[]>({
    queryKey: ["/api/company-contacts"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Calculate property counts for each company (case-insensitive comparison with null safety)
  const companiesWithCounts = useMemo(() => {
    return companies.map(company => {
      const companyNameNormalized = company.companyName.trim().toLowerCase();
      const propertyCount = properties.filter(p => {
        const ownerName = (p.propertyOwner ?? "").trim().toLowerCase();
        return ownerName === companyNameNormalized;
      }).length;
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
    // Toggle expanded state
    setExpandedCompany(prev => prev === companyName ? null : companyName);
    // Also filter properties on the map
    if (onCompanySelect) {
      onCompanySelect(companyName);
    }
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
    <div className="w-96 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-directory">
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
          filteredCompanies.map((company, index) => {
            const isExpanded = expandedCompany === company.companyName;
            const profile = companyProfiles[company.companyName];
            const ranking = companyRankings[company.companyName] || 0;
            
            return (
              <div key={company.id}>
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
                    
                    {/* Social Media Links */}
                    {profile && (profile.instagram || profile.linkedin || profile.facebook || profile.website) && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Social Media</div>
                        <div className="flex items-center gap-3">
                          {profile.instagram && (
                            <a
                              href={profile.instagram}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-500 hover:text-pink-400 transition-colors"
                              data-testid="link-instagram"
                            >
                              <SiInstagram className="w-5 h-5" />
                            </a>
                          )}
                          {profile.linkedin && (
                            <a
                              href={profile.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-500 transition-colors"
                              data-testid="link-linkedin"
                            >
                              <SiLinkedin className="w-5 h-5" />
                            </a>
                          )}
                          {profile.facebook && (
                            <a
                              href={profile.facebook}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400 transition-colors"
                              data-testid="link-facebook"
                            >
                              <SiFacebook className="w-5 h-5" />
                            </a>
                          )}
                          {profile.website && (
                            <a
                              href={profile.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              data-testid="link-website"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </a>
                          )}
                        </div>
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
