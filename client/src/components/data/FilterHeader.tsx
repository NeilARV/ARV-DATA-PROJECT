import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { X, Search, MapPin, Home, ChevronDown, DollarSign, Building2 } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getZipCodesForCounty } from '@/lib/county';
import {
    PROPERTY_TYPES,
    BEDROOM_OPTIONS,
    BATHROOM_OPTIONS,
    DATE_RANGE_OPTIONS,
    MAX_PRICE,
    COUNTIES,
} from '@/constants/filters.constants';
import { DEFAULT_STATUS_FILTERS, PROPERTY_STATUS } from '@/constants/propertyStatus.constants';
import { useFilters } from '@/hooks/useFilters';
import { useCompanies } from '@/hooks/useCompanies';
import { useDataNav } from '@/hooks/useNav';
import { useZipCounts } from '@/hooks/useZipCounts';
import { useProperty } from '@/hooks/useProperty';
import { useGeoMap } from '@/hooks/useMap';
import { useView } from '@/hooks/useView';
import { apiRequest } from '@/lib/queryClient';
import { DEFAULT_DATE_RANGE } from '@/lib/propertyFilters';
import { fetchPropertyById } from '@/api/properties.api';
import { MAP_ZOOM_PROPERTY } from '@/constants/map.constants';
import type { DateRange } from '@/types/filters';
import type { PropertySuggestion } from '@shared/types/properties';

type ZipCodeWithCount = {
    zipCode: string;
    count: number;
    city?: string;
};

type CityWithCount = {
    city: string;
    count: number;
};

// ---- Price helper ----
function formatPrice(val: number): string {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val}`;
}

export default function FilterHeader() {
    const { filters, setFilters, hasActiveFilters } = useFilters();
    const { setCompany } = useCompanies();
    const nav = useDataNav();
    const { setProperty } = useProperty();
    const { setMapCenter, setMapZoom } = useGeoMap();
    const { view } = useView();

    // Zip counts are only needed when the user opens the zip/city autocomplete.
    // Defer the fetch until first interaction to avoid competing with map pins
    // and properties on initial page load.
    const [zipCountsEnabled, setZipCountsEnabled] = useState(false);
    const zipCodesWithCounts = useZipCounts({ enabled: zipCountsEnabled });
    // Tracks whether the zip input is currently focused so the data-arrival
    // effect can open the dropdown when the fetch completes after first focus.
    const zipFocusedRef = useRef(false);
    // Detects the 0 → N transition in sortedZipCodes so the arrival effect
    // only does real work once per fetch, not on every keystroke.
    const prevZipDataLenRef = useRef(0);

    // Local display state (synced from context)
    const [priceRange, setPriceRange] = useState<[number, number]>([
        filters.minPrice ?? 0,
        filters.maxPrice ?? MAX_PRICE,
    ]);
    const [zipInput, setZipInput] = useState<string>(filters.city ?? filters.zipCode ?? '');
    const [countySearch, setCountySearch] = useState<string>(filters.county ?? 'San Diego');
    const [selectedState, setSelectedState] = useState<string>(() => {
        const data = COUNTIES.find((c) => c.county === (filters.county ?? 'San Diego'));
        return data?.state ?? 'CA';
    });
    const [statusFilters, setStatusFilters] = useState<Set<string>>(
        new Set(filters.statusFilters ?? DEFAULT_STATUS_FILTERS),
    );
    // Popover/dropdown open states
    const [priceOpen, setPriceOpen] = useState(false);
    const [countyOpen, setCountyOpen] = useState(false);
    const [zipOpen, setZipOpen] = useState(false);
    const [typeOpen, setTypeOpen] = useState(false);
    const zipWrapperRef = useRef<HTMLDivElement>(null);

    // Suggestion results
    const [filteredZipCodes, setFilteredZipCodes] = useState<ZipCodeWithCount[]>([]);
    const [filteredCities, setFilteredCities] = useState<CityWithCount[]>([]);
    const [filteredCounties, setFilteredCounties] = useState<typeof COUNTIES>([]);
    const [propertySuggestions, setPropertySuggestions] = useState<PropertySuggestion[]>([]);

    // Close zip dropdown when clicking outside the wrapper
    useEffect(() => {
        if (!zipOpen) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (zipWrapperRef.current && !zipWrapperRef.current.contains(e.target as Node)) {
                setZipOpen(false);
                zipFocusedRef.current = false;
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [zipOpen]);

    // Sync local display state when context filters change
    useEffect(() => {
        setPriceRange([filters.minPrice ?? 0, Math.min(filters.maxPrice ?? MAX_PRICE, MAX_PRICE)]);
        setZipInput(filters.city ?? filters.zipCode ?? '');

        const countyVal = filters.county ?? 'San Diego';
        setCountySearch(countyVal);

        const countyData = COUNTIES.find((c) => c.county === countyVal);
        setSelectedState(countyData?.state ?? 'CA');
        setStatusFilters(new Set(filters.statusFilters ?? []));
    }, [filters]);

    const availableStates = useMemo(() => {
        const states = new Set(COUNTIES.map((c) => c.state));
        return Array.from(states).sort();
    }, []);

    const countiesByState = useMemo(
        () => COUNTIES.filter((c) => c.state === selectedState),
        [selectedState],
    );

    const zipCodeList = useMemo(() => {
        return getZipCodesForCounty(filters.county ?? 'San Diego');
    }, [filters.county]);

    const sortedZipCodes = useMemo(
        () =>
            zipCodesWithCounts
                .map((z) => ({
                    ...z,
                    city: zipCodeList.find((zl) => zl.zip === z.zipCode)?.city ?? 'Unknown',
                }))
                .sort((a, b) => b.count - a.count),
        [zipCodesWithCounts, zipCodeList],
    );

    const citiesWithCounts = useMemo<CityWithCount[]>(() => {
        const cityMap = new Map<string, number>();
        sortedZipCodes.forEach((z) => {
            if (z.city && z.city !== 'Unknown') {
                const normalized = z.city.startsWith('San Diego') ? 'San Diego' : z.city;
                cityMap.set(normalized, (cityMap.get(normalized) ?? 0) + z.count);
            }
        });

        return Array.from(cityMap.entries())
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count);
    }, [sortedZipCodes]);

    // When zip counts arrive after the user has already focused the input,
    // populate suggestions and open the dropdown (handles the race where the
    // fetch completes after the focus handler ran against an empty dataset).
    useEffect(() => {
        const prevLen = prevZipDataLenRef.current;
        prevZipDataLenRef.current = sortedZipCodes.length;
        if (prevLen > 0 || sortedZipCodes.length === 0 || !zipFocusedRef.current) return;
        if (zipInput.length > 0) {
            const lower = zipInput.toLowerCase();
            const zipMatches = sortedZipCodes
                .filter(
                    (z) => z.zipCode.startsWith(zipInput) || z.city?.toLowerCase().includes(lower),
                )
                .slice(0, 10);
            const cityMatches = citiesWithCounts
                .filter((c) => {
                    const n = c.city.startsWith('San Diego') ? 'San Diego' : c.city;
                    return n.toLowerCase().includes(lower);
                })
                .slice(0, 10);
            setFilteredZipCodes(zipMatches);
            setFilteredCities(cityMatches);
            setZipOpen(zipMatches.length > 0 || cityMatches.length > 0);
        } else {
            setFilteredZipCodes(sortedZipCodes.slice(0, 10));
            setFilteredCities(citiesWithCounts.slice(0, 10));
            setZipOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortedZipCodes]);

    // Debounced property address suggestions from the API
    useEffect(() => {
        const trimmed = zipInput.trim();
        if (trimmed.length < 2) {
            setPropertySuggestions([]);
            return;
        }
        const county = filters.county ?? 'San Diego';
        const timeoutId = setTimeout(async () => {
            try {
                const res = await apiRequest(
                    'GET',
                    `/api/properties/suggestions?search=${encodeURIComponent(trimmed)}&county=${encodeURIComponent(county)}`,
                );
                const data = await res.json();
                setPropertySuggestions(data);
                if (data.length > 0 && zipFocusedRef.current) {
                    setZipOpen(true);
                }
            } catch {
                setPropertySuggestions([]);
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [zipInput, filters.county]);

    // ---- Handlers ----

    const toggleStatusFilter = (status: string) => {
        setStatusFilters((prev) => {
            const next = new Set(prev);
            if (next.has(status)) {
                if (next.size <= 1) return prev;
                next.delete(status);
            } else {
                next.add(status);
            }
            setFilters((f) => ({ ...f, statusFilters: Array.from(next) }));
            return next;
        });
    };

    const handleZipInputChange = (value: string) => {
        setZipInput(value);
        if (value.length > 0) {
            const lower = value.toLowerCase();

            const zipMatches = sortedZipCodes
                .filter((z) => z.zipCode.startsWith(value) || z.city?.toLowerCase().includes(lower))
                .slice(0, 10);

            const cityMatches = citiesWithCounts
                .filter((c) => {
                    const normalized = c.city.startsWith('San Diego') ? 'San Diego' : c.city;
                    return normalized.toLowerCase().includes(lower);
                })
                .slice(0, 10);

            setFilteredZipCodes(zipMatches);
            setFilteredCities(cityMatches);
            setZipOpen(zipMatches.length > 0 || cityMatches.length > 0);
        } else {
            setFilteredZipCodes(sortedZipCodes.slice(0, 10));
            setFilteredCities(citiesWithCounts.slice(0, 10));
            setZipOpen(false);
            setPropertySuggestions([]);
            setFilters((f) => ({ ...f, zipCode: '', city: undefined }));
        }
    };

    const selectZipCode = (z: ZipCodeWithCount) => {
        setZipInput(z.zipCode);
        setZipOpen(false);
        setPropertySuggestions([]);
        setFilters((f) => ({ ...f, zipCode: z.zipCode, city: undefined }));
    };

    const selectCity = (c: CityWithCount) => {
        setZipInput(c.city);
        setZipOpen(false);
        setPropertySuggestions([]);
        setFilters((f) => ({ ...f, zipCode: '', city: c.city }));
    };

    const selectProperty = async (suggestion: PropertySuggestion) => {
        setZipInput('');
        setZipOpen(false);
        setPropertySuggestions([]);
        const property = await fetchPropertyById(suggestion.id);
        if (property) {
            setProperty(property);
            if (view === 'map' && property.latitude && property.longitude) {
                setMapCenter([property.latitude, property.longitude]);
                setMapZoom(MAP_ZOOM_PROPERTY);
            }
        }
    };

    const handleCountySearch = (value: string) => {
        setCountySearch(value);
        const search = value.replace(/\s+County$/i, '').toLowerCase();
        const matches = countiesByState
            .filter((c) => c.county.toLowerCase().includes(search))
            .slice(0, 10);
        setFilteredCounties(matches);
    };

    const selectCounty = (countyObj: (typeof COUNTIES)[0]) => {
        setCountySearch(countyObj.county);
        setCountyOpen(false);
        setCompany(null);
        setFilters((f) => ({ ...f, county: countyObj.county, zipCode: '', city: undefined }));
        nav.setCounty(countyObj.county);
    };

    const handleStateChange = (newState: string) => {
        setSelectedState(newState);

        const countiesInState = COUNTIES.filter((c) => c.state === newState);
        const currentCounty = filters.county ?? 'San Diego';
        const exists = countiesInState.some((c) => c.county === currentCounty);

        if (!exists && countiesInState.length > 0) {
            const first = countiesInState[0];
            setCountySearch(first.county);
            setCompany(null);
            setFilters((f) => ({ ...f, county: first.county, zipCode: '', city: undefined }));
            nav.setCounty(first.county);
        }
    };

    const togglePropertyType = (type: string) => {
        const next = filters.propertyTypes.includes(type)
            ? filters.propertyTypes.filter((t) => t !== type)
            : [...filters.propertyTypes, type];
        setFilters((f) => ({ ...f, propertyTypes: next }));
    };

    const handleClearFilters = () => {
        const countyToKeep = filters.county ?? 'San Diego';

        setPriceRange([0, MAX_PRICE]);
        setZipInput('');
        setStatusFilters(new Set(DEFAULT_STATUS_FILTERS));
        setFilters((f) => ({
            ...f,
            minPrice: 0,
            maxPrice: MAX_PRICE,
            bedrooms: 'Any',
            bathrooms: 'Any',
            propertyTypes: [],
            zipCode: '',
            city: undefined,
            county: countyToKeep,
            statusFilters: DEFAULT_STATUS_FILTERS,
            dateRange: DEFAULT_DATE_RANGE,
        }));
    };

    const priceLabel =
        priceRange[0] === 0 && priceRange[1] >= MAX_PRICE
            ? 'Any Price'
            : `${formatPrice(priceRange[0])} – ${formatPrice(priceRange[1])}`;

    const propertyTypeLabel =
        filters.propertyTypes.length === 0
            ? 'Property Type'
            : filters.propertyTypes.length === 1
              ? filters.propertyTypes[0]
              : `${filters.propertyTypes.length} Types`;

    const hasPriceFilter = priceRange[0] > 0 || priceRange[1] < MAX_PRICE;

    return (
        <div
            className="border-b border-border bg-background flex-shrink-0"
            data-testid="filter-header"
        >
            <div className="flex xl:flex-row xl:items-center gap-y-2 gap-x-3 px-3 py-2 lg:flex-wrap">
                {/* Status tags */}
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.IN_RENOVATION)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors border-r border-border whitespace-nowrap ${
                            statusFilters.has(PROPERTY_STATUS.IN_RENOVATION)
                                ? 'text-white'
                                : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        style={
                            statusFilters.has(PROPERTY_STATUS.IN_RENOVATION)
                                ? { backgroundColor: '#69C9E1' }
                                : undefined
                        }
                        data-testid="button-filter-in-renovation"
                    >
                        Renovating
                    </button>
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.WHOLESALE)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors border-r border-border whitespace-nowrap ${
                            statusFilters.has(PROPERTY_STATUS.WHOLESALE)
                                ? 'text-white'
                                : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        style={
                            statusFilters.has(PROPERTY_STATUS.WHOLESALE)
                                ? { backgroundColor: '#9333EA' }
                                : undefined
                        }
                        data-testid="button-filter-wholesale"
                    >
                        Wholesale
                    </button>
                    {/* On Market button removed: on-market data unreliable
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.ON_MARKET)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors border-r border-border whitespace-nowrap ${
                        statusFilters.has(PROPERTY_STATUS.ON_MARKET)
                            ? "text-white"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        style={
                        statusFilters.has(PROPERTY_STATUS.ON_MARKET)
                            ? { backgroundColor: "#22C55E" }
                            : undefined
                        }
                        data-testid="button-filter-on-market"
                    >
                        On Market
                    </button>
                    */}
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.SOLD)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                            statusFilters.has(PROPERTY_STATUS.SOLD)
                                ? 'text-white'
                                : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                        style={
                            statusFilters.has(PROPERTY_STATUS.SOLD)
                                ? { backgroundColor: '#FF0000' }
                                : undefined
                        }
                        data-testid="button-filter-sold"
                    >
                        Sold
                    </button>
                </div>

                {/* State */}
                <Select value={selectedState} onValueChange={handleStateChange}>
                    <SelectTrigger
                        className="h-8 w-[68px] text-xs flex-shrink-0 px-2"
                        data-testid="button-state-select"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                        {availableStates.map((state) => (
                            <SelectItem
                                key={state}
                                value={state}
                                data-testid={`option-state-${state}`}
                            >
                                {state}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* County combobox */}
                <Popover
                    open={countyOpen}
                    onOpenChange={(open) => {
                        setCountyOpen(open);
                        if (open) {
                            setCountySearch(filters.county ?? 'San Diego');
                            setFilteredCounties(countiesByState.slice(0, 15));
                        }
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-40 justify-between text-xs flex-shrink-0 px-2"
                            data-testid="button-county-trigger"
                        >
                            <span className="truncate">{countySearch}</span>
                            <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-2 w-52 z-[10000]" align="start">
                        <div className="relative mb-2">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search counties..."
                                value={countySearch}
                                onChange={(e) => handleCountySearch(e.target.value)}
                                className="h-8 pl-7 text-xs"
                                data-testid="input-county"
                                autoFocus
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            {filteredCounties.map((c) => (
                                <div
                                    key={c.county}
                                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted rounded-sm text-sm"
                                    onClick={() => selectCounty(c)}
                                    data-testid={`suggestion-county-${c.county}`}
                                >
                                    <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    {c.county} County
                                </div>
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Zip/City search */}
                <div
                    ref={zipWrapperRef}
                    className="relative flex-shrink-0"
                    data-testid="zip-trigger-wrapper"
                >
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
                    <Input
                        type="text"
                        placeholder="Search zip, city, address..."
                        value={zipInput}
                        onChange={(e) => handleZipInputChange(e.target.value)}
                        onFocus={() => {
                            zipFocusedRef.current = true;
                            setZipCountsEnabled(true);
                            if (sortedZipCodes.length > 0 || citiesWithCounts.length > 0) {
                                setFilteredZipCodes(sortedZipCodes.slice(0, 10));
                                setFilteredCities(citiesWithCounts.slice(0, 10));
                                setZipOpen(true);
                            }
                        }}
                        onClick={() => {
                            zipFocusedRef.current = true;
                            setZipCountsEnabled(true);
                            if (
                                !zipOpen &&
                                (sortedZipCodes.length > 0 || citiesWithCounts.length > 0)
                            ) {
                                setFilteredZipCodes(sortedZipCodes.slice(0, 10));
                                setFilteredCities(citiesWithCounts.slice(0, 10));
                                setZipOpen(true);
                            }
                        }}
                        className="h-8 pl-7 pr-6 text-xs w-52"
                        data-testid="input-zipcode"
                    />
                    {zipInput && (
                        <X
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground hover:text-foreground cursor-pointer z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleZipInputChange('');
                            }}
                        />
                    )}
                    {zipOpen &&
                        (filteredCities.length > 0 ||
                            filteredZipCodes.length > 0 ||
                            propertySuggestions.length > 0) && (
                            <div
                                className="absolute top-full left-0 mt-1 w-60 max-h-60 overflow-y-auto bg-popover border border-border rounded-md shadow-md z-[10000]"
                                data-testid="zipcode-suggestions"
                            >
                                {(filteredCities.length > 0 || filteredZipCodes.length > 0) &&
                                    propertySuggestions.length > 0 && (
                                        <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                                            Areas
                                        </div>
                                    )}
                                {filteredCities.map((city) => (
                                    <div
                                        key={`city-${city.city}`}
                                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            selectCity(city);
                                        }}
                                        data-testid={`suggestion-city-${city.city}`}
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <Home className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                            <span className="font-medium truncate">
                                                {city.city}
                                            </span>
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                                            {city.count}
                                        </span>
                                    </div>
                                ))}
                                {filteredZipCodes.map((z) => (
                                    <div
                                        key={z.zipCode}
                                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            selectZipCode(z);
                                        }}
                                        data-testid={`suggestion-${z.zipCode}`}
                                    >
                                        <span className="flex items-center gap-2 min-w-0">
                                            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                            <span className="font-medium">{z.zipCode}</span>
                                            <span className="text-muted-foreground text-xs truncate">
                                                {z.city}
                                            </span>
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                                            {z.count}
                                        </span>
                                    </div>
                                ))}
                                {propertySuggestions.length > 0 && (
                                    <>
                                        {(filteredCities.length > 0 ||
                                            filteredZipCodes.length > 0) && (
                                            <div className="border-t border-border mx-2 my-1" />
                                        )}
                                        <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                                            Properties
                                        </div>
                                        {propertySuggestions.map((p) => (
                                            <div
                                                key={p.id}
                                                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    selectProperty(p);
                                                }}
                                                data-testid={`suggestion-property-${p.id}`}
                                            >
                                                <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">
                                                        {p.address}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {p.city}, {p.state} {p.zipcode}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                </div>

                {/* Date Range */}
                <Select
                    value={filters.dateRange ?? DEFAULT_DATE_RANGE}
                    onValueChange={(val) =>
                        setFilters((f) => ({ ...f, dateRange: val as DateRange }))
                    }
                >
                    <SelectTrigger
                        className="h-8 w-[140px] text-xs flex-shrink-0"
                        data-testid="select-date-range"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                        {DATE_RANGE_OPTIONS.map((opt) => (
                            <SelectItem
                                key={opt.value}
                                value={opt.value}
                                data-testid={`option-date-range-${opt.value}`}
                            >
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Price popover */}
                <Popover open={priceOpen} onOpenChange={setPriceOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className={`flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs transition-colors flex-shrink-0 whitespace-nowrap ${
                                hasPriceFilter
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-input bg-background hover:bg-accent'
                            }`}
                            data-testid="button-price-trigger"
                        >
                            <DollarSign className="w-3.5 h-3.5" />
                            {priceLabel}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4 z-[10000]" align="start">
                        <div className="space-y-3">
                            <div className="text-xs font-medium">Price Range</div>
                            <div className="text-xs text-muted-foreground">
                                {formatPrice(priceRange[0])} – {formatPrice(priceRange[1])}
                            </div>
                            <Slider
                                value={priceRange}
                                onValueChange={(newRange) => {
                                    setPriceRange(newRange as [number, number]);
                                    setFilters((f) => ({
                                        ...f,
                                        minPrice: newRange[0],
                                        maxPrice: newRange[1],
                                    }));
                                }}
                                min={0}
                                max={MAX_PRICE}
                                step={50000}
                                data-testid="slider-price"
                            />
                        </div>
                    </PopoverContent>
                </Popover>

                {/* Bedrooms */}
                <Select
                    value={filters.bedrooms ?? 'Any'}
                    onValueChange={(val) => setFilters((f) => ({ ...f, bedrooms: val }))}
                >
                    <SelectTrigger
                        className="h-8 w-[130px] text-xs flex-shrink-0"
                        data-testid="select-bedrooms"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                        {BEDROOM_OPTIONS.map((opt) => (
                            <SelectItem
                                key={opt}
                                value={opt}
                                data-testid={`button-bedrooms-${opt}`}
                            >
                                {opt === 'Any' ? 'Any Beds' : `${opt} Beds`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Bathrooms */}
                <Select
                    value={filters.bathrooms ?? 'Any'}
                    onValueChange={(val) => setFilters((f) => ({ ...f, bathrooms: val }))}
                >
                    <SelectTrigger
                        className="h-8 w-[130px] text-xs flex-shrink-0"
                        data-testid="select-bathrooms"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10000]">
                        {BATHROOM_OPTIONS.map((opt) => (
                            <SelectItem
                                key={opt}
                                value={opt}
                                data-testid={`button-bathrooms-${opt}`}
                            >
                                {opt === 'Any' ? 'Any Baths' : `${opt} Baths`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Property Type multi-select */}
                <DropdownMenu open={typeOpen} onOpenChange={setTypeOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={`flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs transition-colors flex-shrink-0 whitespace-nowrap ${
                                filters.propertyTypes.length > 0
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-input bg-background hover:bg-accent'
                            }`}
                            data-testid="button-type-trigger"
                        >
                            {propertyTypeLabel}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 p-1 z-[10000]">
                        {PROPERTY_TYPES.map((type) => (
                            <div
                                key={type}
                                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted rounded-sm text-sm select-none"
                                onClick={(e) => {
                                    e.preventDefault();
                                    togglePropertyType(type);
                                }}
                                data-testid={`checkbox-type-${type.toLowerCase().replace(' ', '-')}`}
                            >
                                <div
                                    className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                        filters.propertyTypes.includes(type)
                                            ? 'bg-primary border-primary'
                                            : 'border-input'
                                    }`}
                                >
                                    {filters.propertyTypes.includes(type) && (
                                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
                                            <path
                                                d="M2 6l3 3 5-5"
                                                stroke="white"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    )}
                                </div>
                                {type}
                            </div>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClearFilters}
                            className="h-8 text-xs flex-shrink-0 text-muted-foreground hover:text-foreground px-2"
                            data-testid="button-reset-filters"
                        >
                            <X className="w-3 h-3 mr-1" />
                            Clear
                        </Button>
                    </>
                )}
            </div>
            {/* end flex container */}
        </div>
    );
}
