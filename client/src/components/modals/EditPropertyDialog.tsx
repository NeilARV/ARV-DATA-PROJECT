import { useState, useEffect } from "react";
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
import { Loader2, Save, Home, DollarSign, User, MapPin } from "lucide-react";

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
  purchasePrice: z.coerce.number().min(0).optional().nullable(),
  dateSold: z.string().optional().nullable(),
  latitude: z.coerce.number().optional().nullable(),
  longitude: z.coerce.number().optional().nullable(),
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

  const { data: companies = [] } = useQuery<CompanyContact[]>({
    queryKey: ["/api/companies/contacts"],
    enabled: open,
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
      purchasePrice: null,
      dateSold: "",
      latitude: null,
      longitude: null,
    },
  });

  useEffect(() => {
    if (property && open) {
      form.reset({
        address: property.address,
        city: property.city,
        state: property.state,
        zipCode: property.zipCode,
        price: property.price,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        squareFeet: property.squareFeet,
        propertyType: property.propertyType,
        yearBuilt: property.yearBuilt ?? null,
        description: property.description ?? "",
        propertyOwner: property.propertyOwner ?? "",
        purchasePrice: property.purchasePrice ?? null,
        dateSold: property.dateSold ?? "",
        latitude: property.latitude ?? null,
        longitude: property.longitude ?? null,
      });
      setActiveTab("basic");
    }
  }, [property, open, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: EditPropertyFormData) => {
      if (!property) throw new Error("No property selected");
      return apiRequest("PATCH", `/api/properties/${property.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
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
      purchasePrice: data.purchasePrice || null,
      dateSold: data.dateSold || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
    };
    updateMutation.mutate(cleanedData);
  };

  if (!property) return null;

  const propertyTypes = [
    "Single Family",
    "Multi-Family",
    "Condo",
    "Townhouse",
    "Commercial",
    "Land",
    "Other",
  ];

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
              <TabsList className="grid w-full grid-cols-4">
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
                <TabsTrigger value="location" data-testid="tab-edit-location">
                  <MapPin className="w-4 h-4 mr-1" />
                  Location
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
                        <SelectContent>
                          {propertyTypes.map((type) => (
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
                      <FormLabel>Current Price *</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} data-testid="input-edit-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Price</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0" 
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                          data-testid="input-edit-purchase-price" 
                        />
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
                <FormField
                  control={form.control}
                  name="propertyOwner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Owner / Company</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "__none__" ? null : value)} 
                        value={field.value || "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-owner">
                            <SelectValue placeholder="Select owner company" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          <SelectItem value="__none__">No Owner</SelectItem>
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.companyName}>
                              {company.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {property.companyContactName && (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <p className="text-sm font-medium">Current Contact Info</p>
                    <p className="text-sm text-muted-foreground">
                      Contact: {property.companyContactName}
                    </p>
                    {property.companyContactEmail && (
                      <p className="text-sm text-muted-foreground">
                        Email: {property.companyContactEmail}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: Contact info is automatically updated when you change the owner company.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="location" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="latitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.000001" 
                            {...field} 
                            value={field.value ?? ""} 
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            data-testid="input-edit-latitude" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="longitude"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitude</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.000001" 
                            {...field} 
                            value={field.value ?? ""} 
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            data-testid="input-edit-longitude" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Coordinates are used for displaying the property on the map. Leave empty to use automatic geocoding.
                </p>
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
