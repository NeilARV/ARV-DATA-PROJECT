import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { X } from "lucide-react";

interface FilterSidebarProps {
  onClose?: () => void;
  onFilterChange?: (filters: PropertyFilters) => void;
}

export interface PropertyFilters {
  minPrice: number;
  maxPrice: number;
  bedrooms: string;
  bathrooms: string;
  propertyTypes: string[];
}

const PROPERTY_TYPES = ['Single Family', 'Townhouse', 'Condo', 'Multi-Family'];
const BEDROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+', '5+'];
const BATHROOM_OPTIONS = ['Any', '1+', '2+', '3+', '4+'];

export default function FilterSidebar({ onClose, onFilterChange }: FilterSidebarProps) {
  const [priceRange, setPriceRange] = useState([0, 2000000]);
  const [selectedBedrooms, setSelectedBedrooms] = useState('Any');
  const [selectedBathrooms, setSelectedBathrooms] = useState('Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const handleApply = () => {
    onFilterChange?.({
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      bedrooms: selectedBedrooms,
      bathrooms: selectedBathrooms,
      propertyTypes: selectedTypes,
    });
    console.log('Filters applied:', { priceRange, selectedBedrooms, selectedBathrooms, selectedTypes });
  };

  const handleReset = () => {
    setPriceRange([0, 2000000]);
    setSelectedBedrooms('Any');
    setSelectedBathrooms('Any');
    setSelectedTypes([]);
    console.log('Filters reset');
  };

  const togglePropertyType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

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
