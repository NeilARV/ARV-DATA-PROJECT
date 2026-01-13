import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Property, CompanyContact } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Home, DollarSign, User } from "lucide-react";
import { PROPERTY_TYPES } from "@/constants/filters.constants";

const editPropertySchema = z.object({
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipCode: z.string().min(1, "Zip code is required"),
  price: z.coerce.number().min(0, "Price must be positive"),
  bedrooms: z.coerce.number().int().min(0, "Bedrooms must be 0 or more"),
  bathrooms: z.coerce.number().min(0, "Bathrooms must be 0 or more"),
  squareFeet: z.coerce.number().int().min(0, "Square feet must be positive"),
  propertyType: z.string().min(1, "Property type is required"),
  yearBuilt: z.coerce.number().int().min(1800).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
  propertyOwner: z.string().optional().nullable(),
  propertyOwnerId: z.string().optional().nullable(),
  companyContactName: z.string().optional().nullable(),
  companyContactEmail: z.string().optional().nullable(),
  dateSold: z.string().optional().nullable(),
});

type EditPropertyFormData = z.infer<typeof editPropertySchema>;

interface EditPropertyDialogProps {
  property: Property | null;
  open: boolean;
  onClose: () => void;
}

export default function EditPropertyDialog({ property, open, onClose }: EditPropertyDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  
  // Company suggestions state
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [companySuggestions, setCompanySuggestions] = useState<Array<{
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
  }>>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const companySearchInputRef = useRef<HTMLInputElement>(null);
  const companySuggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch property data when dialog opens
  // API returns PropertyWithCompany (includes company info from join)
  const { data: propertyData, isLoading: isLoadingProperty } = useQuery<Property & {
    propertyOwner: string | null;
    companyContactName: string | null;
    companyContactEmail: string | null;
  }>({
    queryKey: [`/api/properties/${property?.id}`],
    queryFn: async () => {
      if (!property?.id) throw new Error("No property ID");
      const res = await fetch(`/api/properties/${property.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch property");
      return res.json();
    },
    enabled: open && !!property?.id,
  });

  const form = useForm<EditPropertyFormData>({
    resolver: zodResolver(editPropertySchema),
    defaultValues: {
      address: "",
      city: "",
      state: "",
      zipCode: "",
      price: 0,
      bedrooms: 0,
      bathrooms: 0,
      squareFeet: 0,
      propertyType: "Single Family",
      yearBuilt: null,
      description: "",
      propertyOwner: "",
      propertyOwnerId: null,
      companyContactName: "",
      companyContactEmail: "",
      dateSold: "",
    },
  });

  // Fetch company suggestions with debounce
  const fetchCompanySuggestions = useCallback(async (searchTerm: string) => {
    if (searchTerm.trim().length < 2) {
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(
        `/api/companies/contacts/suggestions?search=${encodeURIComponent(searchTerm)}`,
        { credentials: "include" }
      );
      if (response.ok) {
        const suggestions = await response.json();
        setCompanySuggestions(suggestions);
        setShowCompanySuggestions(suggestions.length > 0);
      } else {
        setCompanySuggestions([]);
        setShowCompanySuggestions(false);
      }
    } catch (error) {
      console.error("Error fetching company suggestions:", error);
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  // Debounce ref for suggestions
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Watch company search query and fetch suggestions with debounce
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (companySearchQuery && companySearchQuery.trim().length >= 2) {
      debounceTimeoutRef.current = setTimeout(() => {
        fetchCompanySuggestions(companySearchQuery);
      }, 300);
    } else {
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [companySearchQuery, fetchCompanySuggestions]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        companySuggestionsRef.current &&
        !companySuggestionsRef.current.contains(event.target as Node) &&
        companySearchInputRef.current &&
        !companySearchInputRef.current.contains(event.target as Node)
      ) {
        setShowCompanySuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle company suggestion selection
  const handleSelectCompany = (company: {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
  }) => {
    form.setValue("propertyOwner", company.companyName);
    form.setValue("propertyOwnerId", company.id);
    form.setValue("companyContactName", company.contactName || "");
    form.setValue("companyContactEmail", company.contactEmail || "");
    setCompanySearchQuery("");
    setShowCompanySuggestions(false);
    setCompanySuggestions([]);
  };

  useEffect(() => {
    if (propertyData && open) {
      form.reset({
        address: propertyData.address,
        city: propertyData.city,
        state: propertyData.state,
        zipCode: propertyData.zipCode,
        price: propertyData.price,
        bedrooms: propertyData.bedrooms,
        bathrooms: propertyData.bathrooms,
        squareFeet: propertyData.squareFeet,
        propertyType: propertyData.propertyType,
        yearBuilt: propertyData.yearBuilt ?? null,
        description: propertyData.description ?? "",
        propertyOwner: propertyData.propertyOwner ?? "",
        propertyOwnerId: (propertyData as any).propertyOwnerId ?? null,
        companyContactName: propertyData.companyContactName ?? "",
        companyContactEmail: propertyData.companyContactEmail ?? "",
        dateSold: propertyData.dateSold ?? "",
      });
      setActiveTab("basic");
      setCompanySearchQuery("");
      setCompanySuggestions([]);
      setShowCompanySuggestions(false);
    }
  }, [propertyData, open, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditPropertyFormData) => {
      if (!property?.id) throw new Error("No property selected");
      return apiRequest("PATCH", `/api/properties/${property.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: [`/api/properties/${property?.id}`] });
      toast({
        title: "Property Updated",
        description: "The property has been successfully updated.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update property",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditPropertyFormData) => {
    const cleanedData = {
      ...data,
      yearBuilt: data.yearBuilt || null,
      description: data.description || null,
      propertyOwner: data.propertyOwner || null,
      propertyOwnerId: data.propertyOwnerId || null,
      companyContactName: data.companyContactName || null,
      companyContactEmail: data.companyContactEmail || null,
      dateSold: data.dateSold || null,
    };
    updateMutation.mutate(cleanedData);
  };

  if (!property) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Edit Property
          </DialogTitle>
          <DialogDescription>
            Make changes to {property.address}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" data-testid="tab-edit-basic">
                  <Home className="w-4 h-4 mr-1" />
                  Basic
                </TabsTrigger>
                <TabsTrigger value="details" data-testid="tab-edit-details">
                  <DollarSign className="w-4 h-4 mr-1" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="owner" data-testid="tab-edit-owner">
                  <User className="w-4 h-4 mr-1" />
                  Owner
                </TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address *</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zipCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zip Code *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-zipcode" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="propertyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-type">
                            <SelectValue placeholder="Select property type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="z-[10001]" position="popper">
                          {PROPERTY_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="bedrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bedrooms *</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" {...field} data-testid="input-edit-beds" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bathrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bathrooms *</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.5" {...field} data-testid="input-edit-baths" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="squareFeet"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sq Ft *</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" {...field} data-testid="input-edit-sqft" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price *</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} data-testid="input-edit-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateSold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date Sold</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          value={field.value ? field.value.split("T")[0] : ""} 
                          data-testid="input-edit-date-sold" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="yearBuilt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year Built</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1800" 
                          max="2100" 
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                          data-testid="input-edit-year-built" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value ?? ""} 
                          rows={3}
                          data-testid="input-edit-description" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="owner" className="space-y-4 mt-4">
                {/* Search Companies Field */}
                <div className="space-y-2">
                  <Label>Search Companies</Label>
                  <div className="relative">
                    <Input
                      ref={companySearchInputRef}
                      value={companySearchQuery}
                      placeholder="Type to search for company..."
                      onChange={(e) => {
                        setCompanySearchQuery(e.target.value);
                        setShowCompanySuggestions(true);
                      }}
                      onFocus={() => {
                        if (companySuggestions.length > 0) {
                          setShowCompanySuggestions(true);
                        }
                      }}
                      data-testid="input-search-companies-edit"
                    />
                    {showCompanySuggestions && companySuggestions.length > 0 && (
                      <div
                        ref={companySuggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
                        data-testid="company-suggestions-edit"
                      >
                        {isLoadingSuggestions ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Searching...
                          </div>
                        ) : (
                          companySuggestions.map((company) => (
                            <div
                              key={company.id}
                              className="px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                              onClick={() => handleSelectCompany(company)}
                              data-testid={`suggestion-company-edit-${company.id}`}
                            >
                              <div className="font-medium">{company.companyName}</div>
                              {(company.contactName || company.contactEmail) && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {company.contactName && <div>{company.contactName}</div>}
                                  {company.contactEmail && <div>{company.contactEmail}</div>}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Search for a company to auto-fill the fields below, or enter them manually
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="propertyOwner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Owner</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="John Doe LLC"
                          data-testid="input-edit-owner"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Contact Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          placeholder="Contact Name"
                          data-testid="input-edit-contact-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="companyContactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Contact Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          type="email"
                          placeholder="contact@company.com"
                          data-testid="input-edit-contact-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={updateMutation.isPending}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
