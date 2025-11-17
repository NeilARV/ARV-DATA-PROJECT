import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface FilterSidebarProps {
  onClose?: () => void;
  onFilterChange?: (filters: PropertyFilters) => void;
  availableZipCodes?: string[];
}

export interface PropertyFilters {
  minPrice: number;
  maxPrice: number;
  bedrooms: string;
  bathrooms: string;
  propertyTypes: string[];
  zipCode: string;
}

const PROPERTY_TYPES = ['Single Family', 'Townhouse', 'Condo'];
const BEDROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+', '5+'];
const BATHROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+'];

const SAN_DIEGO_ZIP_CODES = [
  '92101', '92102', '92103', '92104', '92105', '92106', '92107', '92108', '92109', '92110',
  '92111', '92113', '92114', '92115', '92116', '92117', '92119', '92120', '92121', '92122',
  '92123', '92124', '92126', '92127', '92128', '92129', '92130', '92131', '92132', '92134',
  '92135', '92136', '92139', '92140', '92145', '92147', '92154', '92155', '92161', '92179',
  '92182'
];

export default function FilterSidebar({ onClose, onFilterChange, availableZipCodes = [] }: FilterSidebarProps) {
  const [priceRange, setPriceRange] = useState([0, 2000000]);
  const [selectedBedrooms, setSelectedBedrooms] = useState('Any');
  const [selectedBathrooms, setSelectedBathrooms] = useState('Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [zipCode, setZipCode] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredZipCodes, setFilteredZipCodes] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const handleApply = () => {
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
      zipCode: zipCode,
    });
    console.log('Filters applied:', { priceRange, selectedBedrooms, selectedBathrooms, selectedTypes, zipCode });
  };

  const handleReset = () => {
    setPriceRange([0, 2000000]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    setZipCode('');
    console.log('Filters reset');
  };

  const togglePropertyType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleZipCodeChange = (value: string) => {
    setZipCode(value);
    if (value.length > 0) {
      const allZipCodes = Array.from(new Set([...SAN_DIEGO_ZIP_CODES, ...availableZipCodes])).sort();
      const matches = allZipCodes
        .filter(zip => zip.startsWith(value))
        .slice(0, 10);
      setFilteredZipCodes(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectZipCode = (zip: string) => {
    setZipCode(zip);
    setShowSuggestions(false);
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
    <div className="w-80 h-full bg-background border-r border-border flex flex-col" data-testid="sidebar-filters">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Filters</h2>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-filters">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="relative">
          <Label className="text-sm font-medium mb-2 block">Zip Code</Label>
          <Input
            ref={inputRef}
            type="text"
            placeholder="Enter zip code"
            value={zipCode}
            onChange={(e) => handleZipCodeChange(e.target.value)}
            onFocus={() => {
              if (zipCode.length > 0 && filteredZipCodes.length > 0) {
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
              {filteredZipCodes.map((zip) => (
                <div
                  key={zip}
                  className="px-3 py-2 cursor-pointer hover-elevate text-sm"
                  onClick={() => selectZipCode(zip)}
                  data-testid={`suggestion-${zip}`}
                >
                  {zip}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium mb-4 block">Price Range</Label>
          <div className="mb-2 text-sm text-muted-foreground">
            ${priceRange[0].toLocaleString()} - ${priceRange[1].toLocaleString()}
          </div>
          <Slider
            value={priceRange}
            onValueChange={setPriceRange}
            min={0}
            max={5000000}
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
                onClick={() => setSelectedBedrooms(option)}
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
                onClick={() => setSelectedBathrooms(option)}
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
