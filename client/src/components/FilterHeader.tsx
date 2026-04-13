import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { X, Search, MapPin, Home, CalendarIcon, ChevronDown, DollarSign } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { countyNameToKey } from "@/lib/county";
import {
    PROPERTY_TYPES,
    BEDROOM_OPTIONS,
    BATHROOM_OPTIONS,
    MAX_PRICE,
    SAN_DIEGO_MSA_ZIP_CODES,
    LOS_ANGELES_MSA_ZIP_CODES,
    DENVER_MSA_ZIP_CODES,
    SAN_FRANCISCO_MSA_ZIP_CODES,
    COUNTIES,
    MIAMI_MSA_ZIP_CODES,
    PORT_ST_LUCIE_MSA_ZIP_CODES,
    SEATTLE_MSA_ZIP_CODES
} from "@/constants/filters.constants";
import { DEFAULT_STATUS_FILTERS, PROPERTY_STATUS } from "@/constants/propertyStatus.constants";
import { useFilters } from "@/hooks/useFilters";
import { useCompanies } from "@/hooks/useCompanies";
import type { ZipCodeWithCount, CityWithCount } from "@/types/filters";

// ---- Date helpers ----
function isoToDisplay(iso: string | undefined): string {
    if (!iso || iso.length !== 10) return "";
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
}

function displayToIso(display: string): string | undefined {
    if (display.length !== 10) return undefined;
    
    const parts = display.split("/");
    if (parts.length !== 3) return undefined;
    
    const [m, d, y] = parts;
    if (!m || !d || !y || y.length !== 4) return undefined;
    
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00`);
    if (isNaN(date.getTime())) return undefined;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function parseDisplayDate(display: string): Date | undefined {
    const iso = displayToIso(display);
    if (!iso) return undefined;
    const d = new Date(iso + "T00:00:00");
    return isNaN(d.getTime()) ? undefined : d;
}

function formatPrice(val: number): string {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val}`;
}

// ---- Props ----
export interface FilterHeaderProps {
    zipCodesWithCounts?: ZipCodeWithCount[];
}

export default function FilterHeader({
    zipCodesWithCounts = [],
}: FilterHeaderProps) {
    const { filters, setFilters, hasActiveFilters } = useFilters();
    const { setCompany } = useCompanies();

    // Local display state (synced from context)
    const [priceRange, setPriceRange] = useState<[number, number]>([
        filters.minPrice ?? 0,
        filters.maxPrice ?? MAX_PRICE,
    ]);
    const [zipInput, setZipInput] = useState<string>(filters.city ?? filters.zipCode ?? "");
    const [countySearch, setCountySearch] = useState<string>(filters.county ?? "San Diego");
    const [selectedState, setSelectedState] = useState<string>(() => {
        const data = COUNTIES.find((c) => c.county === (filters.county ?? "San Diego"));
        return data?.state ?? "CA";
    });
    const [statusFilters, setStatusFilters] = useState<Set<string>>(
        new Set(filters.statusFilters ?? DEFAULT_STATUS_FILTERS)
    );
    const [dateMinDisplay, setDateMinDisplay] = useState(isoToDisplay(filters.dateMin));
    const [dateMaxDisplay, setDateMaxDisplay] = useState(isoToDisplay(filters.dateMax));

    // Popover/dropdown open states
    const [dateMinOpen, setDateMinOpen] = useState(false);
    const [dateMaxOpen, setDateMaxOpen] = useState(false);
    const [priceOpen, setPriceOpen] = useState(false);
    const [countyOpen, setCountyOpen] = useState(false);
    const [zipOpen, setZipOpen] = useState(false);
    const [typeOpen, setTypeOpen] = useState(false);

    // Suggestion results
    const [filteredZipCodes, setFilteredZipCodes] = useState<ZipCodeWithCount[]>([]);
    const [filteredCities, setFilteredCities] = useState<CityWithCount[]>([]);
    const [filteredCounties, setFilteredCounties] = useState<typeof COUNTIES>([]);

    // Sync local display state when context filters change
    useEffect(() => {
        setPriceRange([
            filters.minPrice ?? 0,
            Math.min(filters.maxPrice ?? MAX_PRICE, MAX_PRICE),
        ]);
        setZipInput(filters.city ?? filters.zipCode ?? "");

        const countyVal = filters.county ?? "San Diego";
        setCountySearch(countyVal);

        const countyData = COUNTIES.find((c) => c.county === countyVal);
        setSelectedState(countyData?.state ?? "CA");
        setStatusFilters(new Set(filters.statusFilters ?? []));
        setDateMinDisplay(isoToDisplay(filters.dateMin));
        setDateMaxDisplay(isoToDisplay(filters.dateMax));
    }, [filters]);

    const availableStates = useMemo(() => {
        const states = new Set(COUNTIES.map((c) => c.state));
        return Array.from(states).sort();
    }, []);

    const countiesByState = useMemo(
        () => COUNTIES.filter((c) => c.state === selectedState),
        [selectedState]
    );

    const zipCodeList = useMemo(() => {
            
        const countyName = filters.county ?? "San Diego";
        const countyKey = countyNameToKey(countyName);
        let msaZipCodes: Record<string, Array<{ zip: string; city: string }>>;
        
        if (selectedState === "CA") {
            if (countyName === "Los Angeles" || countyName === "Orange") {
                msaZipCodes = LOS_ANGELES_MSA_ZIP_CODES;
            } else if (["San Francisco", "Alameda", "Contra Costa", "Marin", "San Mateo"].includes(countyName)) {
                msaZipCodes = SAN_FRANCISCO_MSA_ZIP_CODES;
            } else {
                msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
            }
        } else if (selectedState === "CO") {
        msaZipCodes = DENVER_MSA_ZIP_CODES;
        } else if (selectedState === "FL") {
            if (countyName === "St. Lucie" || countyName === "Martin") {
                msaZipCodes = PORT_ST_LUCIE_MSA_ZIP_CODES;
            } else {
                msaZipCodes = MIAMI_MSA_ZIP_CODES;
            }
        } else if (selectedState === "WA") {
            msaZipCodes = SEATTLE_MSA_ZIP_CODES;
        } else {
            msaZipCodes = SAN_DIEGO_MSA_ZIP_CODES;
        }

        const list = msaZipCodes[countyKey];
        return Array.isArray(list) ? list : [];
    }, [filters.county, selectedState]);

    const sortedZipCodes = useMemo(
        () =>
            zipCodesWithCounts
                .map((z) => ({
                    ...z,
                    city: zipCodeList.find((zl) => zl.zip === z.zipCode)?.city ?? "Unknown",
                }))
                .sort((a, b) => b.count - a.count),
        [zipCodesWithCounts, zipCodeList]
    );

    const citiesWithCounts = useMemo<CityWithCount[]>(() => {
        const cityMap = new Map<string, number>();
        sortedZipCodes.forEach((z) => {
            if (z.city && z.city !== "Unknown") {
                const normalized = z.city.startsWith("San Diego") ? "San Diego" : z.city;
                cityMap.set(normalized, (cityMap.get(normalized) ?? 0) + z.count);
            }
        });
        
        return Array.from(cityMap.entries())
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count);
    }, [sortedZipCodes]);

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
                    const normalized = c.city.startsWith("San Diego") ? "San Diego" : c.city;
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
            setFilters((f) => ({ ...f, zipCode: "", city: undefined }));
        }
    };

    const selectZipCode = (z: ZipCodeWithCount) => {
        setZipInput(z.zipCode);
        setZipOpen(false);
        setFilters((f) => ({ ...f, zipCode: z.zipCode, city: undefined }));
    };

    const selectCity = (c: CityWithCount) => {
        setZipInput(c.city);
        setZipOpen(false);
        setFilters((f) => ({ ...f, zipCode: "", city: c.city }));
    };

    const handleCountySearch = (value: string) => {
        setCountySearch(value);
        const search = value.replace(/\s+County$/i, "").toLowerCase();
        const matches = countiesByState
            .filter((c) => c.county.toLowerCase().includes(search))
            .slice(0, 10);
        setFilteredCounties(matches);
    };

    const selectCounty = (countyObj: (typeof COUNTIES)[0]) => {
        setCountySearch(countyObj.county);
        setCountyOpen(false);
        setCompany(null);
        setFilters((f) => ({ ...f, county: countyObj.county, zipCode: "", city: undefined }));
    };

    const handleStateChange = (newState: string) => {
        setSelectedState(newState);

        const countiesInState = COUNTIES.filter((c) => c.state === newState);
        const currentCounty = filters.county ?? "San Diego";
        const exists = countiesInState.some((c) => c.county === currentCounty);

        if (!exists && countiesInState.length > 0) {
            const first = countiesInState[0];
            setCountySearch(first.county);
            setCompany(null);
            setFilters((f) => ({ ...f, county: first.county, zipCode: "", city: undefined }));
        }
    };

    const togglePropertyType = (type: string) => {
        const next = filters.propertyTypes.includes(type)
            ? filters.propertyTypes.filter((t) => t !== type)
            : [...filters.propertyTypes, type];
        setFilters((f) => ({ ...f, propertyTypes: next }));
    };

    const handleClearFilters = () => {
        const countyToKeep = filters.county ?? "San Diego";
        const today = new Date();
        const sixtyDaysAgo = new Date(today);
        
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const dateMax = toISODate(today);
        const dateMin = toISODate(sixtyDaysAgo);

        setPriceRange([0, MAX_PRICE]);
        setZipInput("");
        setStatusFilters(new Set(DEFAULT_STATUS_FILTERS));
        setDateMinDisplay(isoToDisplay(dateMin));
        setDateMaxDisplay(isoToDisplay(dateMax));
        setFilters((f) => ({
            ...f,
            minPrice: 0,
            maxPrice: MAX_PRICE,
            bedrooms: "Any",
            bathrooms: "Any",
            propertyTypes: [],
            zipCode: "",
            city: undefined,
            county: countyToKeep,
            statusFilters: DEFAULT_STATUS_FILTERS,
            dateMin,
            dateMax,
        }));
    };

    const priceLabel =
        priceRange[0] === 0 && priceRange[1] >= MAX_PRICE
            ? "Any Price"
            : `${formatPrice(priceRange[0])} – ${formatPrice(priceRange[1])}`;

    const propertyTypeLabel =
        filters.propertyTypes.length === 0
            ? "Property Type"
            : filters.propertyTypes.length === 1
            ? filters.propertyTypes[0]
            : `${filters.propertyTypes.length} Types`;

    const hasPriceFilter = priceRange[0] > 0 || priceRange[1] < MAX_PRICE;

    return (
        <div className="border-b border-border bg-background flex-shrink-0" data-testid="filter-header">
            <div className="flex xl:flex-row xl:items-center gap-y-2 gap-x-3 px-3 py-2 lg:flex-wrap">

                {/* Status tags */}
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.IN_RENOVATION)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors border-r border-border whitespace-nowrap ${
                        statusFilters.has(PROPERTY_STATUS.IN_RENOVATION)
                            ? "text-white"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        style={
                        statusFilters.has(PROPERTY_STATUS.IN_RENOVATION)
                            ? { backgroundColor: "#69C9E1" }
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
                            ? "text-white"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        style={
                        statusFilters.has(PROPERTY_STATUS.WHOLESALE)
                            ? { backgroundColor: "#9333EA" }
                            : undefined
                        }
                        data-testid="button-filter-wholesale"
                    >
                        Wholesale
                    </button>
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
                    <button
                        onClick={() => toggleStatusFilter(PROPERTY_STATUS.SOLD)}
                        className={`px-3 h-8 flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                        statusFilters.has(PROPERTY_STATUS.SOLD)
                            ? "text-white"
                            : "bg-background text-muted-foreground hover:bg-muted"
                        }`}
                        style={
                        statusFilters.has(PROPERTY_STATUS.SOLD)
                            ? { backgroundColor: "#FF0000" }
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
                    <SelectItem key={state} value={state} data-testid={`option-state-${state}`}>
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
                    setCountySearch(filters.county ?? "San Diego");
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
                <Popover open={zipOpen} onOpenChange={setZipOpen}>
                <PopoverTrigger asChild>
                    <div className="relative flex-shrink-0" data-testid="zip-trigger-wrapper">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none z-10" />
                    <Input
                        type="text"
                        placeholder="Zip code or city"
                        value={zipInput}
                        onChange={(e) => handleZipInputChange(e.target.value)}
                        onFocus={() => {
                        if (sortedZipCodes.length > 0 || citiesWithCounts.length > 0) {
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
                            handleZipInputChange("");
                        }}
                        />
                    )}
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    className="p-0 w-60 z-[10000]"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    data-testid="zipcode-suggestions"
                >
                    <div className="max-h-60 overflow-y-auto">
                    {filteredCities.map((city) => (
                        <div
                        key={`city-${city.city}`}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                        onClick={() => selectCity(city)}
                        data-testid={`suggestion-city-${city.city}`}
                        >
                        <span className="flex items-center gap-2 min-w-0">
                            <Home className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">{city.city}</span>
                        </span>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{city.count}</span>
                        </div>
                    ))}
                    {filteredZipCodes.map((z) => (
                        <div
                        key={z.zipCode}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                        onClick={() => selectZipCode(z)}
                        data-testid={`suggestion-${z.zipCode}`}
                        >
                        <span className="flex items-center gap-2 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">{z.zipCode}</span>
                            <span className="text-muted-foreground text-xs truncate">{z.city}</span>
                        </span>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{z.count}</span>
                        </div>
                    ))}
                    </div>
                </PopoverContent>
                </Popover>

                {/* Date From */}
                <div className="items-center flex space-x-2">
                <Popover open={dateMinOpen} onOpenChange={setDateMinOpen}>
                    <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent transition-colors flex-shrink-0 whitespace-nowrap"
                        data-testid="input-date-min"
                    >
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className={dateMinDisplay ? "text-foreground" : "text-muted-foreground"}>
                        {dateMinDisplay || "From"}
                        </span>
                    </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[10000]" align="start">
                    <Calendar
                        mode="single"
                        selected={parseDisplayDate(dateMinDisplay)}
                        defaultMonth={parseDisplayDate(dateMinDisplay)}
                        onSelect={(date) => {
                        if (date) {
                            const iso = toISODate(date);
                            setDateMinDisplay(isoToDisplay(iso));
                            setFilters((f) => ({ ...f, dateMin: iso }));
                        }
                        setDateMinOpen(false);
                        }}
                        disabled={(date) => date > new Date()}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground flex-shrink-0">→</span>
                {/* Date To */}
                <Popover open={dateMaxOpen} onOpenChange={setDateMaxOpen}>
                    <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent transition-colors flex-shrink-0 whitespace-nowrap"
                        data-testid="input-date-max"
                    >
                        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className={dateMaxDisplay ? "text-foreground" : "text-muted-foreground"}>
                        {dateMaxDisplay || "To"}
                        </span>
                    </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[10000]" align="start">
                    <Calendar
                        mode="single"
                        selected={parseDisplayDate(dateMaxDisplay)}
                        defaultMonth={parseDisplayDate(dateMaxDisplay)}
                        onSelect={(date) => {
                        if (date) {
                            const iso = toISODate(date);
                            setDateMaxDisplay(isoToDisplay(iso));
                            setFilters((f) => ({ ...f, dateMax: iso }));
                        }
                        setDateMaxOpen(false);
                        }}
                        disabled={(date) => date > new Date()}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                </div>

                {/* Price popover */}
                <Popover open={priceOpen} onOpenChange={setPriceOpen}>
                    <PopoverTrigger asChild>
                        <button
                        type="button"
                        className={`flex items-center gap-1.5 h-8 rounded-md border px-3 text-xs transition-colors flex-shrink-0 whitespace-nowrap ${
                            hasPriceFilter
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background hover:bg-accent"
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
                            setFilters((f) => ({ ...f, minPrice: newRange[0], maxPrice: newRange[1] }));
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
                    value={filters.bedrooms ?? "Any"}
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
                        <SelectItem key={opt} value={opt} data-testid={`button-bedrooms-${opt}`}>
                            {opt === "Any" ? "Any Beds" : `${opt} Beds`}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Bathrooms */}
                <Select
                    value={filters.bathrooms ?? "Any"}
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
                        <SelectItem key={opt} value={opt} data-testid={`button-bathrooms-${opt}`}>
                            {opt === "Any" ? "Any Baths" : `${opt} Baths`}
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
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-input bg-background hover:bg-accent"
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
                            data-testid={`checkbox-type-${type.toLowerCase().replace(" ", "-")}`}
                        >
                            <div
                            className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                filters.propertyTypes.includes(type)
                                ? "bg-primary border-primary"
                                : "border-input"
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

            </div>{/* end flex container */}
        </div>
    );
}
