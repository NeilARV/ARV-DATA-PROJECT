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
import { PROPERTY_TYPES, BEDROOM_OPTIONS, BATHROOM_OPTIONS, SAN_DIEGO_MSA_ZIP_CODES, LOS_ANGELES_MSA_ZIP_CODES, DENVER_MSA_ZIP_CODES, SAN_FRANCISCO_MSA_ZIP_CODES, COUNTIES } from "@/constants/filters.constants";

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
  county?: string; // Optional county filter
  statusFilters: string[];
}

type ZipCodeSortOption = "most-properties" | "fewest-properties" | "alphabetical";

const MAX_PRICE = 10000000;

export default function FilterSidebar({ onClose, onFilterChange, zipCodesWithCounts = [], onSwitchToDirectory, filters }: FilterSidebarProps) {
  const [priceRange, setPriceRange] = useState<[number, number]>([filters?.minPrice ?? 0, filters?.maxPrice ?? MAX_PRICE]);

  const [selectedBedrooms, setSelectedBedrooms] = useState<string>(filters?.bedrooms ?? 'Any');
  const [selectedBathrooms, setSelectedBathrooms] = useState<string>(filters?.bathrooms ?? 'Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(filters?.propertyTypes ?? []);
  const [zipCode, setZipCode] = useState<string>(filters?.zipCode ?? '');
  const [selectedState, setSelectedState] = useState<string>('CA'); // Default to CA
  const [county, setCounty] = useState<string>(filters?.county ?? 'San Diego');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCountySuggestions, setShowCountySuggestions] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [filteredZipCodes, setFilteredZipCodes] = useState<ZipCodeWithCount[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityWithCount[]>([]);
  const [filteredCounties, setFilteredCounties] = useState<typeof COUNTIES>([]);
  const [zipCodeSort, setZipCodeSort] = useState<ZipCodeSortOption>("most-properties");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(filters?.statusFilters ?? ["in-renovation"]));
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const countyInputRef = useRef<HTMLInputElement>(null);
  const countySuggestionsRef = useRef<HTMLDivElement>(null);

  // Sync local UI state when parent-controlled filters change (for persistence across view switches)
  useEffect(() => {
    if (!filters) return;
    setPriceRange([filters.minPrice ?? 0, Math.min(filters.maxPrice ?? MAX_PRICE, MAX_PRICE)]);
    setSelectedBedrooms(filters.bedrooms ?? 'Any');
    setSelectedBathrooms(filters.bathrooms ?? 'Any');
    setSelectedTypes(filters.propertyTypes ?? []);
    // If city is set, show city name; otherwise show zip code
    setZipCode(filters.city ?? filters.zipCode ?? '');
    // Set county from filters, default to San Diego - display with "County" suffix
    const countyValue = filters.county ?? 'San Diego';
    setCounty(countyValue ? `${countyValue} County` : 'San Diego County');
    
    // Infer state from county
    const countyData = COUNTIES.find(c => c.county === countyValue);
    if (countyData) {
      setSelectedState(countyData.state);
    } else {
      // Default to CA if county not found
      setSelectedState('CA');
    }
    
    setStatusFilters(new Set(filters.statusFilters ?? []));
  }, [filters]);

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
        county: filters?.county ?? 'San Diego',
        statusFilters: Array.from(next),
      });
      return next;
    });
  };

  // Get unique states from COUNTIES
  const availableStates = useMemo(() => {
    const states = new Set(COUNTIES.map(c => c.state));
    return Array.from(states).sort();
  }, []);

  // Filter counties based on selected state
  const countiesByState = useMemo(() => {
    return COUNTIES.filter(c => c.state === selectedState);
  }, [selectedState]);

  // Helper function to convert county name to object key format (e.g., "San Diego" -> "san_diego")
  const countyNameToKey = (countyName: string): string => {
    return countyName.toLowerCase().replace(/\s+/g, '_');
  };

  // Select the appropriate zip code list based on state and county filter
  const zipCodeList = useMemo(() => {
    const countyName = filters?.county ?? 'San Diego';
    const state = selectedState;
    const countyKey = countyNameToKey(countyName);

    // Get the appropriate MSA zip codes object based on state
    let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
    if (state === 'CA') {
      // Check if it's Los Angeles MSA (Los Angeles or Orange county)
      if (countyName === 'Los Angeles' || countyName === 'Orange') {
        msaZipCodes = LOS_ANGELES_MSA_ZIP_CODES;
      } 
      if (countyName === 'San Francisco' || countyName === 'Alameda' || countyName === 'Contra Costa' || countyName === 'Marin' || countyName === 'San Mateo') {
        msaZipCodes = SAN_FRANCISCO_MSA_ZIP_CODES;
      }
      else {
        // San Diego MSA (San Diego county)
        msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
      }
    } else if (state === 'CO') {
      // Denver MSA
      msaZipCodes = DENVER_MSA_ZIP_CODES;
    } else {
      // Default to San Diego MSA
      msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
    }

    // Get the zip codes for the specific county
    const countyZipCodes = msaZipCodes[countyKey];
    
    // Return the array or empty array if county not found
    return Array.isArray(countyZipCodes) ? countyZipCodes : [];
  }, [filters?.county, selectedState]);

  const sortedZipCodes = useMemo(() => {
    const enrichedZips = zipCodesWithCounts.map(z => ({
      ...z,
      city: zipCodeList.find(zip => zip.zip === z.zipCode)?.city || 'Unknown'
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
  }, [zipCodesWithCounts, zipCodeSort, zipCodeList]);

  // Calculate cities with counts (aggregate zip codes by city)
  // Normalize San Diego city names - aggregate all "San Diego - *" variations into just "San Diego"
  // Sort cities by the same option as zip codes: most/fewest properties or alphabetical
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

    const entries = Array.from(cityMap.entries()).map(([city, count]) => ({ city, count }));

    switch (zipCodeSort) {
      case "most-properties":
        return entries.sort((a, b) => b.count - a.count);
      case "fewest-properties":
        return entries.sort((a, b) => a.count - b.count);
      case "alphabetical":
        return entries.sort((a, b) => a.city.localeCompare(b.city));
      default:
        return entries;
    }
  }, [sortedZipCodes, zipCodeSort]);

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
      county: filters?.county ?? 'San Diego',
      statusFilters: Array.from(statusFilters),
    });
    console.log('Filters applied:', { priceRange, selectedBedrooms, selectedBathrooms, selectedTypes, zipCode, city: filters?.city, county: filters?.county, statusFilters: Array.from(statusFilters) });
  };

  const handleClearFilters = () => {
    // Preserve current county and state when clearing all other filters
    const countyToKeep = filters?.county ?? 'San Diego';
    const stateToKeep = COUNTIES.find(c => c.county === countyToKeep)?.state ?? 'CA';

    setPriceRange([0, MAX_PRICE]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    setSelectedState(stateToKeep);
    setCounty(`${countyToKeep} County`);
    setStatusFilters(new Set(["in-renovation"]));
    onFilterChange?.({
      minPrice: 0,
      maxPrice: MAX_PRICE,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: countyToKeep,
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
        county: filters?.county ?? 'San Diego',
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
        county: filters?.county ?? 'San Diego',
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
      county: filters?.county ?? 'San Diego',
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
      county: filters?.county ?? 'San Diego', // Preserve county filter
      statusFilters: Array.from(statusFilters),
    });
  };

  const handleCountyChange = (value: string) => {
    setCounty(value);
    if (value.length > 0) {
      // Remove "County" suffix if present for searching
      const searchValue = value.replace(/\s+County$/i, '').toLowerCase();
      const countyMatches = countiesByState
        .filter(c => c.county.toLowerCase().includes(searchValue))
        .slice(0, 10);
      setFilteredCounties(countyMatches);
      setShowCountySuggestions(countyMatches.length > 0);
    } else {
      setFilteredCounties(countiesByState.slice(0, 10));
      setShowCountySuggestions(false);
    }
  };

  const handleStateChange = (newState: string) => {
    setSelectedState(newState);

    // Get counties for the new state
    const countiesInNewState = COUNTIES.filter(c => c.state === newState);

    // Check if current county exists in the new state
    const currentCountyName = filters?.county ?? 'San Diego';
    const countyExistsInNewState = countiesInNewState.some(
      c => c.county === currentCountyName || c.county === currentCountyName.replace(' County', '')
    );

    // If current county doesn't exist in new state, set to first county in new state and clear all filters
    if (!countyExistsInNewState && countiesInNewState.length > 0) {
      const firstCounty = countiesInNewState[0];
      setCounty(`${firstCounty.county} County`);

      // Clear all filters when switching to a new state/county so all properties in that area appear
      setPriceRange([0, MAX_PRICE]);
      setSelectedBedrooms('Any');
      setSelectedBathrooms('Any');
      setSelectedTypes([]);
      setZipCode('');
      setStatusFilters(new Set(["in-renovation"]));

      onFilterChange?.({
        minPrice: 0,
        maxPrice: MAX_PRICE,
        bedrooms: 'Any',
        bathrooms: 'Any',
        propertyTypes: [],
        zipCode: '',
        city: undefined,
        county: firstCounty.county,
        statusFilters: ["in-renovation"],
      });
    }

    setShowCountySuggestions(false);
  };

  const selectCounty = (countyObj: typeof COUNTIES[0]) => {
    setCounty(`${countyObj.county} County`);
    setShowCountySuggestions(false);

    // Clear all filters when selecting a new county so all properties in that area appear
    setPriceRange([0, MAX_PRICE]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    setStatusFilters(new Set(["in-renovation"]));

    onFilterChange?.({
      minPrice: 0,
      maxPrice: MAX_PRICE,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      city: undefined,
      county: countyObj.county,
      statusFilters: ["in-renovation"],
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close county suggestions
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }

      // Close county dropdown suggestions
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

  return (
    <div className="w-[375px] flex-shrink-0 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-filters">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
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
        <div className="flex flex-wrap gap-2">
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
          <Button
            size="sm"
            variant={statusFilters.has("sold-b2b") ? "default" : "outline"}
            onClick={() => toggleStatusFilter("sold-b2b")}
            className={statusFilters.has("sold-b2b") ? "bg-primary hover:bg-primary/90" : ""}
            data-testid="button-filter-sold-b2b"
          >
            Sold (B2B)
          </Button>
        </div>

        {/* State & County Selection */}
        <div>
          <Label className="text-sm font-medium mb-2 block">State & County</Label>
          <div className="flex gap-2">
            {/* State Selection - Smaller */}
            <DropdownMenu open={stateDropdownOpen} onOpenChange={setStateDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-20 justify-between shrink-0" size="sm" data-testid="button-state-select">
                  {selectedState}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {availableStates.map((state) => (
                  <DropdownMenuItem
                    key={state}
                    onClick={() => {
                      handleStateChange(state);
                      setStateDropdownOpen(false);
                    }}
                    data-testid={`option-state-${state}`}
                  >
                    {state}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* County Search */}
            <div className="relative flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search counties"
              ref={countyInputRef}
              value={county}
              onChange={(e) => {
                handleCountyChange(e.target.value)
              }}
              onFocus={() => {
                if (countiesByState.length > 0) {
                  setFilteredCounties(countiesByState.slice(0, 10));
                  setShowCountySuggestions(true);
                }
              }}
              className="pl-9"
              data-testid="input-county"
            />
          </div>
          {showCountySuggestions && filteredCounties.length > 0 && (
            <div
              ref={countySuggestionsRef}
              className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
              data-testid="county-suggestions"
            >
              {filteredCounties.map((county) => (
                <div
                  key={`county-${county.county}`}
                  className="px-3 py-2 cursor-pointer hover-elevate text-sm flex items-center gap-2"
                  onClick={() => selectCounty(county)}
                  data-testid={`suggestion-county-${county.county}`}
                >
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium truncate">{county.county} County</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium">Zip Code</Label>
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
                county: filters?.county ?? 'San Diego',
                statusFilters: Array.from(statusFilters),
              });
            }}
            min={0}
            max={MAX_PRICE}
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
                    county: filters?.county ?? 'San Diego',
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
                    county: filters?.county ?? 'San Diego',
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
          <div className="grid grid-cols-2 gap-2">
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
