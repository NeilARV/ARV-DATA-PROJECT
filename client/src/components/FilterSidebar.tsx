import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { X, Building2, ArrowUpDown, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ZipCodeWithCount {
  zipCode: string;
  count: number;
  city?: string;
}

interface FilterSidebarProps {
  onClose?: () => void;
  onFilterChange?: (filters: PropertyFilters) => void;
  zipCodesWithCounts?: ZipCodeWithCount[];
  onSwitchToDirectory?: () => void;
}

export interface PropertyFilters {
  minPrice: number;
  maxPrice: number; // Use Number.MAX_SAFE_INTEGER for "no limit"
  bedrooms: string;
  bathrooms: string;
  propertyTypes: string[];
  zipCode: string;
  statusFilters: string[];
}

const PROPERTY_TYPES = ['Single Family', 'Townhouse', 'Condo', 'Vacant Land'];
const BEDROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+', '5+'];
const BATHROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+'];

const SAN_DIEGO_ZIP_CODES = [
  { zip: '91901', city: 'Alpine' },
  { zip: '91902', city: 'Bonita' },
  { zip: '91905', city: 'Boulevard' },
  { zip: '91906', city: 'Campo' },
  { zip: '91910', city: 'Chula Vista' },
  { zip: '91911', city: 'Chula Vista' },
  { zip: '91913', city: 'Chula Vista' },
  { zip: '91914', city: 'Chula Vista' },
  { zip: '91915', city: 'Chula Vista' },
  { zip: '91916', city: 'Descanso' },
  { zip: '91917', city: 'Dulzura' },
  { zip: '91931', city: 'Guatay' },
  { zip: '91932', city: 'Imperial Beach' },
  { zip: '91934', city: 'Jacumba' },
  { zip: '91935', city: 'Jamul' },
  { zip: '91941', city: 'La Mesa' },
  { zip: '91942', city: 'La Mesa' },
  { zip: '91945', city: 'Lemon Grove' },
  { zip: '91948', city: 'Mount Laguna' },
  { zip: '91950', city: 'National City' },
  { zip: '91962', city: 'Pine Valley' },
  { zip: '91963', city: 'Potrero' },
  { zip: '91977', city: 'Spring Valley' },
  { zip: '91978', city: 'Spring Valley' },
  { zip: '91980', city: 'Tecate' },
  { zip: '92003', city: 'Bonsall' },
  { zip: '92004', city: 'Borrego Springs' },
  { zip: '92007', city: 'Cardiff By The Sea' },
  { zip: '92008', city: 'Carlsbad' },
  { zip: '92009', city: 'Carlsbad' },
  { zip: '92010', city: 'Carlsbad' },
  { zip: '92011', city: 'Carlsbad' },
  { zip: '92014', city: 'Del Mar' },
  { zip: '92019', city: 'El Cajon' },
  { zip: '92020', city: 'El Cajon' },
  { zip: '92021', city: 'El Cajon' },
  { zip: '92024', city: 'Encinitas' },
  { zip: '92025', city: 'Escondido' },
  { zip: '92026', city: 'Escondido' },
  { zip: '92027', city: 'Escondido' },
  { zip: '92029', city: 'Escondido' },
  { zip: '92028', city: 'Fallbrook' },
  { zip: '92036', city: 'Julian' },
  { zip: '92037', city: 'La Jolla' },
  { zip: '92092', city: 'La Jolla' },
  { zip: '92093', city: 'La Jolla' },
  { zip: '92040', city: 'Lakeside' },
  { zip: '92054', city: 'Oceanside' },
  { zip: '92055', city: 'Camp Pendleton' },
  { zip: '92056', city: 'Oceanside' },
  { zip: '92057', city: 'Oceanside' },
  { zip: '92058', city: 'Oceanside' },
  { zip: '92059', city: 'Pala' },
  { zip: '92060', city: 'Palomar Mountain' },
  { zip: '92061', city: 'Pauma Valley' },
  { zip: '92064', city: 'Poway' },
  { zip: '92065', city: 'Ramona' },
  { zip: '92066', city: 'Ranchita' },
  { zip: '92067', city: 'Rancho Santa Fe' },
  { zip: '92091', city: 'Rancho Santa Fe' },
  { zip: '92069', city: 'San Marcos' },
  { zip: '92078', city: 'San Marcos' },
  { zip: '92096', city: 'San Marcos' },
  { zip: '92071', city: 'Santee' },
  { zip: '92075', city: 'Solana Beach' },
  { zip: '92070', city: 'Santa Ysabel' },
  { zip: '92082', city: 'Valley Center' },
  { zip: '92081', city: 'Vista' },
  { zip: '92083', city: 'Vista' },
  { zip: '92084', city: 'Vista' },
  { zip: '92086', city: 'Warner Springs' },
  { zip: '92101', city: 'San Diego - Downtown' },
  { zip: '92102', city: 'San Diego - Golden Hill' },
  { zip: '92103', city: 'San Diego - Hillcrest' },
  { zip: '92104', city: 'San Diego - North Park' },
  { zip: '92105', city: 'San Diego - City Heights' },
  { zip: '92106', city: 'San Diego - Point Loma' },
  { zip: '92107', city: 'San Diego - Ocean Beach' },
  { zip: '92108', city: 'San Diego - Mission Valley' },
  { zip: '92109', city: 'San Diego - Pacific Beach' },
  { zip: '92110', city: 'San Diego - Old Town' },
  { zip: '92111', city: 'San Diego - Linda Vista' },
  { zip: '92113', city: 'San Diego - Logan Heights' },
  { zip: '92114', city: 'San Diego - Encanto' },
  { zip: '92115', city: 'San Diego - College Area' },
  { zip: '92116', city: 'San Diego - Normal Heights' },
  { zip: '92117', city: 'San Diego - Clairemont' },
  { zip: '92119', city: 'San Diego - Navajo' },
  { zip: '92120', city: 'San Diego - Grantville' },
  { zip: '92121', city: 'San Diego - Sorrento Valley' },
  { zip: '92122', city: 'San Diego - University City' },
  { zip: '92123', city: 'San Diego - Serra Mesa' },
  { zip: '92124', city: 'San Diego - Tierrasanta' },
  { zip: '92126', city: 'San Diego - Mira Mesa' },
  { zip: '92127', city: 'San Diego - Rancho Bernardo' },
  { zip: '92128', city: 'San Diego - Carmel Mountain Ranch' },
  { zip: '92129', city: 'San Diego - Rancho Peñasquitos' },
  { zip: '92130', city: 'San Diego - Carmel Valley' },
  { zip: '92131', city: 'San Diego - Scripps Ranch' },
  { zip: '92132', city: 'San Diego' },
  { zip: '92134', city: 'San Diego' },
  { zip: '92135', city: 'San Diego' },
  { zip: '92136', city: 'San Diego' },
  { zip: '92139', city: 'San Diego' },
  { zip: '92140', city: 'San Diego' },
  { zip: '92145', city: 'San Diego' },
  { zip: '92147', city: 'San Diego' },
  { zip: '92154', city: 'San Diego' },
  { zip: '92155', city: 'San Diego' },
  { zip: '92161', city: 'San Diego' },
  { zip: '92173', city: 'San Ysidro' },
  { zip: '92179', city: 'San Diego' },
  { zip: '92182', city: 'San Diego' },
  { zip: '92118', city: 'Coronado' },
  { zip: '92672', city: 'San Clemente' },
];

type ZipCodeSortOption = "most-properties" | "fewest-properties" | "alphabetical";

export default function FilterSidebar({ onClose, onFilterChange, zipCodesWithCounts = [], onSwitchToDirectory }: FilterSidebarProps) {
  const [priceRange, setPriceRange] = useState([0, 10000000]);
  const [selectedBedrooms, setSelectedBedrooms] = useState('Any');
  const [selectedBathrooms, setSelectedBathrooms] = useState('Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [zipCode, setZipCode] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredZipCodes, setFilteredZipCodes] = useState<ZipCodeWithCount[]>([]);
  const [zipCodeSort, setZipCodeSort] = useState<ZipCodeSortOption>("most-properties");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set(["in-renovation"]));
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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
        zipCode: zipCode,
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
      zipCode: zipCode,
      statusFilters: Array.from(statusFilters),
    });
    console.log('Filters applied:', { priceRange, selectedBedrooms, selectedBathrooms, selectedTypes, zipCode, statusFilters: Array.from(statusFilters) });
  };

  const handleReset = () => {
    setPriceRange([0, 10000000]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    console.log('Filters reset');
  };

  const handleClearAll = () => {
    setPriceRange([0, 10000000]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    setStatusFilters(new Set(["in-renovation"]));
    onFilterChange?.({
      minPrice: 0,
      maxPrice: 10000000,
      bedrooms: 'Any',
      bathrooms: 'Any',
      propertyTypes: [],
      zipCode: '',
      statusFilters: ["in-renovation"],
    });
    console.log('All filters cleared');
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
        zipCode: zipCode,
        statusFilters: Array.from(statusFilters),
      });
      return next;
    });
  };

  const handleZipCodeChange = (value: string) => {
    setZipCode(value);
    if (value.length > 0) {
      const matches = sortedZipCodes
        .filter(z => z.zipCode.startsWith(value) || z.city?.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10);
      setFilteredZipCodes(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      // Show all sorted zip codes when input is empty but focused
      setFilteredZipCodes(sortedZipCodes.slice(0, 10));
      setShowSuggestions(false);
    }
  };

  const selectZipCode = (zipCodeData: ZipCodeWithCount) => {
    setZipCode(zipCodeData.zipCode);
    setShowSuggestions(false);
    
    // Immediately apply the zip code filter
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
      zipCode: zipCodeData.zipCode,
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
    <div className="w-96 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-filters">
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
        <Button 
          variant="default" 
          onClick={handleClearAll} 
          className="w-full"
          data-testid="button-clear-all-filters"
        >
          Clear All Filters
        </Button>

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
          <Input
            ref={inputRef}
            type="text"
            placeholder="Enter zip code or city"
            value={zipCode}
            onChange={(e) => handleZipCodeChange(e.target.value)}
            onFocus={() => {
              if (sortedZipCodes.length > 0) {
                setFilteredZipCodes(sortedZipCodes.slice(0, 10));
                setShowSuggestions(true);
              }
            }}
            data-testid="input-zipcode"
          />
          {showSuggestions && filteredZipCodes.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto"
              data-testid="zipcode-suggestions"
            >
              {filteredZipCodes.map((z) => (
                <div
                  key={z.zipCode}
                  className="px-3 py-2 cursor-pointer hover-elevate text-sm flex items-center justify-between"
                  onClick={() => selectZipCode(z)}
                  data-testid={`suggestion-${z.zipCode}`}
                >
                  <span>
                    <span className="font-medium">{z.zipCode}</span>
                    <span className="text-muted-foreground ml-2">{z.city}</span>
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
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
              setPriceRange(newRange);
              // Immediately apply when slider changes
              onFilterChange?.({
                minPrice: newRange[0],
                maxPrice: newRange[1],
                bedrooms: selectedBedrooms,
                bathrooms: selectedBathrooms,
                propertyTypes: selectedTypes,
                zipCode: zipCode,
                statusFilters: Array.from(statusFilters),
              });
            }}
            min={0}
            max={10000000}
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
                    zipCode: zipCode,
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
                    zipCode: zipCode,
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
        <Button variant="outline" onClick={handleReset} className="flex-1" data-testid="button-reset-filters">
          Reset
        </Button>
        <Button onClick={handleApply} className="flex-1" data-testid="button-apply-filters">
          Apply
        </Button>
      </div>
    </div>
  );
}
