import { useState, useRef, useEffect } from "react";
import type { PropertyRow } from "@/types/property";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Database, Loader2, Pencil, Search, Trash2, X, Plus, CloudUpload, MapPin, Home } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { COUNTIES } from "@/constants/filters.constants";

interface ManagePropertiesTabProps {
  properties: PropertyRow[];
  isLoading: boolean;
  onOpenUpload: () => void;
  selectedCounty: string;
  onCountyChange: (county: string) => void;
}

export default function ManagePropertiesTab({
  properties,
  isLoading,
  onOpenUpload,
  selectedCounty,
  onCountyChange,
}: ManagePropertiesTabProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [county, setCounty] = useState<string>(`${selectedCounty} County`);
  const [showCountySuggestions, setShowCountySuggestions] = useState(false);
  const [filteredCounties, setFilteredCounties] = useState<typeof COUNTIES>([]);
  const countyInputRef = useRef<HTMLInputElement>(null);
  const countySuggestionsRef = useRef<HTMLDivElement>(null);

  // Sync county display when selectedCounty prop changes
  useEffect(() => {
    setCounty(`${selectedCounty} County`);
  }, [selectedCounty]);

  const handleCountyChange = (value: string) => {
    setCounty(value);
    if (value.length > 0) {
      // Remove "County" suffix if present for searching
      const searchValue = value.replace(/\s+County$/i, '').toLowerCase();
      const countyMatches = COUNTIES
        .filter(c => c.county.toLowerCase().includes(searchValue))
        .slice(0, 10);
      setFilteredCounties(countyMatches);
      setShowCountySuggestions(countyMatches.length > 0);
    } else {
      setFilteredCounties(COUNTIES.slice(0, 10));
      setShowCountySuggestions(false);
    }
  };

  const selectCounty = (countyObj: typeof COUNTIES[0]) => {
    setCounty(`${countyObj.county} County`);
    setShowCountySuggestions(false);
    // Notify parent of county change (store base name without "County" suffix)
    onCountyChange(countyObj.county);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        countySuggestionsRef.current &&
        !countySuggestionsRef.current.contains(event.target as Node) &&
        countyInputRef.current &&
        !countyInputRef.current.contains(event.target as Node)
      ) {
        setShowCountySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter properties based on search query
  const filteredProperties = properties.filter((property) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();
    const searchableFields = [
      property.address,
      property.city,
      property.state,
      property.zipCode,
      property.propertyOwner,
    ].filter(Boolean);

    return searchableFields.some((field) =>
      field?.toLowerCase().includes(query),
    );
  });

  const deleteSingleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/properties/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/properties');
        }
      });
      toast({
        title: "Success",
        description: "Property has been deleted",
      });
      setPropertyToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete property",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSingle = (id: string) => {
    deleteSingleMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Manage Properties</CardTitle>
          <CardDescription>
            View, edit, and delete individual properties from your database
          </CardDescription>
        </div>
        <Button onClick={onOpenUpload} data-testid="button-add-property">
          <Plus className="w-4 h-4 mr-2" />
          Add Property
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !properties || properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Database className="w-16 h-16 text-muted-foreground" />
            <p className="text-muted-foreground">No properties in database</p>
            <Button
              variant="outline"
              onClick={onOpenUpload}
              data-testid="button-upload-first"
            >
              <CloudUpload className="w-4 h-4 mr-2" />
              Upload Properties
            </Button>
          </div>
        ) : (
          <div>
            <div className="mb-4 space-y-3">
              {/* County Filter and Search on same row */}
              <div className="flex items-end gap-3">
                {/* County Filter - smaller width */}
                <div className="relative w-[200px]">
                  <Label className="text-sm font-medium mb-2 block">County</Label>
                  <div className="relative">
                    <Home className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search counties"
                      ref={countyInputRef}
                      value={county}
                      onChange={(e) => handleCountyChange(e.target.value)}
                      onFocus={() => {
                        if (COUNTIES.length > 0) {
                          setFilteredCounties(COUNTIES.slice(0, 10));
                          setShowCountySuggestions(true);
                        }
                      }}
                      className="pl-9 pr-9"
                      data-testid="input-county-filter"
                    />
                    {county && (
                      <X 
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => {
                          setCounty('San Diego County');
                          setShowCountySuggestions(false);
                          onCountyChange('San Diego');
                        }}
                      />
                    )}
                  </div>
                  {showCountySuggestions && filteredCounties.length > 0 && (
                    <div
                      ref={countySuggestionsRef}
                      className="absolute z-50 w-[200px] mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
                      data-testid="county-suggestions"
                    >
                      {filteredCounties.map((countyObj) => (
                        <div
                          key={`county-${countyObj.county}`}
                          className="px-3 py-2 cursor-pointer hover-elevate text-sm flex items-center gap-2"
                          onClick={() => selectCounty(countyObj)}
                          data-testid={`suggestion-county-${countyObj.county}`}
                        >
                          <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium truncate">{countyObj.county} County</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search Input - takes remaining space */}
                <div className="relative flex-1">
                  <Label className="text-sm font-medium mb-2 block">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by address, city, state, zip code, or owner..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-9"
                      data-testid="input-search-properties"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setSearchQuery("")}
                        data-testid="button-clear-search"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? (
                  <>
                    Showing {filteredProperties.length} of {properties.length}{" "}
                    propert{properties.length === 1 ? "y" : "ies"} in {selectedCounty} County
                  </>
                ) : (
                  <>
                    Total: {properties.length} propert
                    {properties.length === 1 ? "y" : "ies"} in {selectedCounty} County
                  </>
                )}
              </p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="min-w-[200px]">Address</TableHead>
                      <TableHead className="min-w-[100px]">City</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-center">Beds</TableHead>
                      <TableHead className="text-center">Baths</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No properties match your search
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow
                          key={property.id}
                          data-testid={`row-property-${property.id}`}
                        >
                          <TableCell className="font-medium">
                            <div>{property.address}</div>
                            <div className="text-xs text-muted-foreground">
                              {property.state} {property.zipCode}
                            </div>
                          </TableCell>
                          <TableCell>{property.city}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${property.price?.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            {property.bedrooms}
                          </TableCell>
                          <TableCell className="text-center">
                            {property.bathrooms}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <AlertDialog
                                open={propertyToDelete === property.id}
                                onOpenChange={(open) => {
                                  if (!open) setPropertyToDelete(null);
                                }}
                              >
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setPropertyToDelete(property.id)
                                    }
                                    data-testid={`button-delete-${property.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Property?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete{" "}
                                      {property.address}? This action cannot be
                                      undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="button-cancel-delete">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleDeleteSingle(property.id)
                                      }
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      data-testid="button-confirm-delete"
                                    >
                                      {deleteSingleMutation.isPending ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Deleting...
                                        </>
                                      ) : (
                                        "Delete"
                                      )}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

