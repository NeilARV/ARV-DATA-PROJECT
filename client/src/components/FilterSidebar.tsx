import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { X, Building2, ArrowUpDown, ChevronDown, Search, MapPin, Home } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROPERTY_TYPES, BEDROOM_OPTIONS, BATHROOM_OPTIONS, SAN_DIEGO_ZIP_CODES } from "@/constants/filters.constants";

export interface ZipCodeWithCount {
  zipCode: string;
  count: number;
  city?: string;
}

export interface CityWithCount {
  city: string;
  count: number;
}

interface FilterSidebarProps {
  onClose?: () => void;
  onFilterChange?: (filters: PropertyFilters) => void;
  zipCodesWithCounts?: ZipCodeWithCount[];
  onSwitchToDirectory?: () => void;
  maxPriceSlider?: number; // Dynamic max price for slider
  filters?: PropertyFilters; // Controlled filters from parent
}

export interface PropertyFilters {
  minPrice: number;
  maxPrice: number; // Use Number.MAX_SAFE_INTEGER for "no limit"
  bedrooms: string;
  bathrooms: string;
  propertyTypes: string[];
  zipCode: string;
  city?: string; // Optional city filter
  statusFilters: string[];
}

type ZipCodeSortOption = "most-properties" | "fewest-properties" | "alphabetical";

export default function FilterSidebar({ onClose, onFilterChange, zipCodesWithCounts = [], onSwitchToDirectory, maxPriceSlider = 10000000, filters }: FilterSidebarProps) {
  const [priceRange, setPriceRange] = useState<[number, number]>([filters?.minPrice ?? 0, filters?.maxPrice ?? maxPriceSlider]);
  
  // Update price range when maxPriceSlider changes
  useEffect(() => {
    setPriceRange(prev => [prev[0], Math.min(prev[1], maxPriceSlider)]);
  }, [maxPriceSlider]);

  const [selectedBedrooms, setSelectedBedrooms] = useState<string>(filters?.bedrooms ?? 'Any');
  const [selectedBathrooms, setSelectedBathrooms] = useState<string>(filters?.bathrooms ?? 'Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(filters?.propertyTypes ?? []);
  const [zipCode, setZipCode] = useState<string>(filters?.zipCode ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredZipCodes, setFilteredZipCodes] = useState<ZipCodeWithCount[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityWithCount[]>([]);
  const [zipCodeSort, setZipCodeSort] = useState<ZipCodeSortOption>("most-properties");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters?.statusFilters ?? ["in-renovation"]));
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Sync local UI state when parent-controlled filters change (for persistence across view switches)
  useEffect(() => {
    if (!filters) return;
    setPriceRange([filters.minPrice ?? 0, Math.min(filters.maxPrice ?? maxPriceSlider, maxPriceSlider)]);
    setSelectedBedrooms(filters.bedrooms ?? 'Any');
    setSelectedBathrooms(filters.bathrooms ?? 'Any');
    setSelectedTypes(filters.propertyTypes ?? []);
    // If city is set, show city name; otherwise show zip code
    setZipCode(filters.city ?? filters.zipCode ?? '');
    setStatusFilters(new Set(filters.statusFilters ?? []));
  }, [filters, maxPriceSlider]);

  const toggleStatusFilter = (status: string) => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      // Immediately apply filter when status changes
      onFilterChange?.({
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
        bedrooms: selectedBedrooms,
        bathrooms: selectedBathrooms,
        propertyTypes: selectedTypes,
        zipCode: filters?.zipCode ?? zipCode,
        city: filters?.city,
        statusFilters: Array.from(next),
      });
      return next;
    });
  };

  const sortedZipCodes = useMemo(() => {
    const enrichedZips = zipCodesWithCounts.map(z => ({
      ...z,
      city: SAN_DIEGO_ZIP_CODES.find(sd => sd.zip === z.zipCode)?.city || 'Unknown'
    }));
    
    switch (zipCodeSort) {
      case "most-properties":
        return [...enrichedZips].sort((a, b) => b.count - a.count);
      case "fewest-properties":
        return [...enrichedZips].sort((a, b) => a.count - b.count);
      case "alphabetical":
        return [...enrichedZips].sort((a, b) => a.zipCode.localeCompare(b.zipCode));
      default:
        return enrichedZips;
    }
  }, [zipCodesWithCounts, zipCodeSort]);

  // Calculate cities with counts (aggregate zip codes by city)
  // Normalize San Diego city names - aggregate all "San Diego - *" variations into just "San Diego"
  const citiesWithCounts = useMemo(() => {
    const cityMap = new Map<string, number>();
    
    sortedZipCodes.forEach(zip => {
      if (zip.city && zip.city !== 'Unknown') {
        // Normalize San Diego city names (e.g., "San Diego - Downtown" -> "San Diego")
        const normalizedCity = zip.city.startsWith('San Diego') ? 'San Diego' : zip.city;
        const currentCount = cityMap.get(normalizedCity) || 0;
        cityMap.set(normalizedCity, currentCount + zip.count);
      }
    });
    
    return Array.from(cityMap.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => a.city.localeCompare(b.city)); // Sort alphabetically
  }, [sortedZipCodes]);

  const zipCodeSortLabels: Record<ZipCodeSortOption, string> = {
    "most-properties": "Most Properties",
    "fewest-properties": "Fewest Properties",
    "alphabetical": "Alphabetical"
  };

  const handleApply = () => {
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
      zipCode: filters?.zipCode ?? zipCode,
      city: filters?.city,
      statusFilters: Array.from(statusFilters),
    });
    console.log('Filters applied:', { priceRange, selectedBedrooms, selectedBathrooms, selectedTypes, zipCode, city: filters?.city, statusFilters: Array.from(statusFilters) });
  };

  const handleClearFilters = () => {
    setPriceRange([0, maxPriceSlider]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    setStatusFilters(new Set(["in-renovation"]));
    onFilterChange?.({
      minPrice: 0,
      maxPrice: maxPriceSlider,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      statusFilters: ["in-renovation"],
    });
  };

  const togglePropertyType = (type: string) => {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      // Immediately apply when property type changes
      onFilterChange?.({
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
        bedrooms: selectedBedrooms,
        bathrooms: selectedBathrooms,
        propertyTypes: next,
        zipCode: filters?.zipCode ?? zipCode,
        city: filters?.city,
        statusFilters: Array.from(statusFilters),
      });
      return next;
    });
  };

  const handleZipCodeChange = (value: string) => {
    setZipCode(value);
    if (value.length > 0) {
      const lowerValue = value.toLowerCase();
      
      // Filter zip codes
      const zipMatches = sortedZipCodes
        .filter(z => z.zipCode.startsWith(value) || z.city?.toLowerCase().includes(lowerValue))
        .slice(0, 10);
      
      // Filter cities (normalize San Diego when filtering)
      const cityMatches = citiesWithCounts
        .filter(c => {
          const normalizedCityForFilter = c.city.startsWith('San Diego') ? 'San Diego' : c.city;
          return normalizedCityForFilter.toLowerCase().includes(lowerValue);
        })
        .slice(0, 10);
      
      setFilteredZipCodes(zipMatches);
      setFilteredCities(cityMatches);
      setShowSuggestions(zipMatches.length > 0 || cityMatches.length > 0);
    } else {
      // Show all sorted zip codes and cities when input is empty but focused
      setFilteredZipCodes(sortedZipCodes.slice(0, 10));
      setFilteredCities(citiesWithCounts.slice(0, 10));
      setShowSuggestions(false);

      // If the user cleared the input, notify parent to clear both zip and city filters
      onFilterChange?.({
        minPrice: priceRange[0],
        maxPrice: priceRange[1],
        bedrooms: selectedBedrooms,
        bathrooms: selectedBathrooms,
        propertyTypes: selectedTypes,
        zipCode: '',
        city: undefined,
        statusFilters: Array.from(statusFilters),
      });
    }
  };

  const selectZipCode = (zipCodeData: ZipCodeWithCount) => {
    setZipCode(zipCodeData.zipCode);
    setShowSuggestions(false);
    
    // Immediately apply the zip code filter (clear city when zip code is selected)
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
      zipCode: zipCodeData.zipCode,
      city: undefined,
      statusFilters: Array.from(statusFilters),
    });
  };

  const selectCity = (cityData: CityWithCount) => {
    setZipCode(cityData.city);
    setShowSuggestions(false);
    
    // Immediately apply the city filter (clear zip code when city is selected)
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
      zipCode: '',
      city: cityData.city,
      statusFilters: Array.from(statusFilters),
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-[450px] h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-filters">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-2">
            <Button variant="default" size="sm" data-testid="button-tab-filters">
              Filters
            </Button>
            {onSwitchToDirectory && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onSwitchToDirectory}
                data-testid="button-tab-directory"
              >
                <Building2 className="w-4 h-4 mr-1" />
                Investor Profiles
              </Button>
            )}
          </div>
          {onClose && (
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-filters">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Status Filter Toggles */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={statusFilters.has("in-renovation") ? "default" : "outline"}
            onClick={() => toggleStatusFilter("in-renovation")}
            className={statusFilters.has("in-renovation") ? "bg-primary hover:bg-primary/90" : ""}
            data-testid="button-filter-in-renovation"
          >
            In Renovation
          </Button>
          <Button
            size="sm"
            variant={statusFilters.has("on-market") ? "default" : "outline"}
            onClick={() => toggleStatusFilter("on-market")}
            className={statusFilters.has("on-market") ? "bg-primary hover:bg-primary/90" : ""}
            data-testid="button-filter-on-market"
          >
            On Market
          </Button>
          <Button
            size="sm"
            variant={statusFilters.has("sold") ? "default" : "outline"}
            onClick={() => toggleStatusFilter("sold")}
            className={statusFilters.has("sold") ? "bg-primary hover:bg-primary/90" : ""}
            data-testid="button-filter-sold"
          >
            Sold
          </Button>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Zip Code</Label>
            {zipCodesWithCounts.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" data-testid="button-zipcode-sort">
                    <ArrowUpDown className="w-3 h-3" />
                    {zipCodeSortLabels[zipCodeSort]}
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => setZipCodeSort("most-properties")}
                    data-testid="sort-most-properties"
                  >
                    Most Properties
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setZipCodeSort("fewest-properties")}
                    data-testid="sort-fewest-properties"
                  >
                    Fewest Properties
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setZipCodeSort("alphabetical")}
                    data-testid="sort-alphabetical"
                  >
                    Alphabetical
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Enter zip code or city"
              ref={inputRef}
              value={zipCode}
              onChange={(e) => {
                handleZipCodeChange(e.target.value)
              }}
              onFocus={() => {
                if (sortedZipCodes.length > 0 || citiesWithCounts.length > 0) {
                  setFilteredZipCodes(sortedZipCodes.slice(0, 10));
                  setFilteredCities(citiesWithCounts.slice(0, 10));
                  setShowSuggestions(true);
                }
              }}
              className="pl-9"
              data-testid="input-zipcode"
            />
            {zipCode && (
              <X 
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleZipCodeChange("")}
              />
            )}
          </div>
          {showSuggestions && (filteredCities.length > 0 || filteredZipCodes.length > 0) && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
              data-testid="zipcode-suggestions"
            >
              {/* Show cities first */}
              {filteredCities.map((city) => (
                <div
                  key={`city-${city.city}`}
                  className="px-3 py-2 cursor-pointer hover-elevate text-sm flex items-center justify-between gap-2"
                  onClick={() => selectCity(city)}
                  data-testid={`suggestion-city-${city.city}`}
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <Home className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{city.city}</span>
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                    {city.count} {city.count === 1 ? 'property' : 'properties'}
                  </span>
                </div>
              ))}
              {/* Then show zip codes */}
              {filteredZipCodes.map((z) => (
                <div
                  key={z.zipCode}
                  className="px-3 py-2 cursor-pointer hover-elevate text-sm flex items-center justify-between gap-2"
                  onClick={() => selectZipCode(z)}
                  data-testid={`suggestion-${z.zipCode}`}
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">
                      <span className="font-medium">{z.zipCode}</span>
                      <span className="text-muted-foreground ml-2">{z.city}</span>
                    </span>
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                    {z.count} {z.count === 1 ? 'property' : 'properties'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Price Range</Label>
          <div className="mb-2 text-sm text-muted-foreground">
            ${priceRange[0].toLocaleString()} - ${priceRange[1].toLocaleString()}
          </div>
          <Slider
            value={priceRange}
            onValueChange={(newRange) => {
              setPriceRange(newRange as [number, number]);
              // Immediately apply when slider changes
              onFilterChange?.({
                minPrice: newRange[0],
                maxPrice: newRange[1],
                bedrooms: selectedBedrooms,
                bathrooms: selectedBathrooms,
                propertyTypes: selectedTypes,
                zipCode: filters?.zipCode ?? zipCode,
                city: filters?.city,
                statusFilters: Array.from(statusFilters),
              });
            }}
            min={0}
            max={maxPriceSlider}
            step={50000}
            className="mb-2"
            data-testid="slider-price"
          />
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Bedrooms</Label>
          <div className="grid grid-cols-3 gap-2">
            {BEDROOM_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={selectedBedrooms === option ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedBedrooms(option);
                  // Immediately apply when bedrooms filter changes
                  onFilterChange?.({
                    minPrice: priceRange[0],
                    maxPrice: priceRange[1],
                    bedrooms: option,
                    bathrooms: selectedBathrooms,
                    propertyTypes: selectedTypes,
                    zipCode: filters?.zipCode ?? zipCode,
                    city: filters?.city,
                    statusFilters: Array.from(statusFilters),
                  });
                }}
                data-testid={`button-bedrooms-${option}`}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Bathrooms</Label>
          <div className="grid grid-cols-3 gap-2">
            {BATHROOM_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={selectedBathrooms === option ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedBathrooms(option);
                  // Immediately apply when bathrooms filter changes
                  onFilterChange?.({
                    minPrice: priceRange[0],
                    maxPrice: priceRange[1],
                    bedrooms: selectedBedrooms,
                    bathrooms: option,
                    propertyTypes: selectedTypes,
                    zipCode: filters?.zipCode ?? zipCode,
                    city: filters?.city,
                    statusFilters: Array.from(statusFilters),
                  });
                }}
                data-testid={`button-bathrooms-${option}`}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Property Type</Label>
          <div className="space-y-2">
            {PROPERTY_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={() => togglePropertyType(type)}
                  className="rounded border-border"
                  data-testid={`checkbox-type-${type.toLowerCase().replace(' ', '-')}`}
                />
                <span className="text-sm">{type}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border flex gap-2">
        <Button variant="outline" onClick={handleClearFilters} className="flex-1" data-testid="button-reset-filters">
          Clear Filters
        </Button>
        <Button onClick={handleApply} className="flex-1" data-testid="button-apply-filters">
          Apply
        </Button>
      </div>
    </div>
  );
}
