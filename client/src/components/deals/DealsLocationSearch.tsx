import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, MapPin, Building2, Hash } from "lucide-react";
import { COUNTIES } from "@/constants/filters.constants";
import { getMsaNameFromCounty } from "@/lib/county";

export type LocationFilter =
    | { type: "msa";  value: string; label: string; county: string; state: string }
    | { type: "city"; value: string; label: string }
    | { type: "zip";  value: string; label: string };

type Suggestion = {
    kind: "county" | "city" | "zip";
    label: string;
    sublabel: string;
    filter: LocationFilter;
};

type DealsLocationSearchProps = {
    deals: Deal[];
    value: LocationFilter | null;
    onChange: (filter: LocationFilter | null) => void;
};

export default function DealsLocationSearch({ deals, value, onChange }: DealsLocationSearchProps) {
    const [inputText, setInputText] = useState(value?.label ?? "");
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync display text when filter is cleared externally
    useEffect(() => {
        if (!value) setInputText("");
        else setInputText(value.label);
    }, [value]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    // Unique cities and zips from deals
    const dealCities = useMemo(() => {
        const seen = new Set<string>();
        const result: { city: string; state: string }[] = [];
        for (const d of deals) {
            if (!d.city) continue;
            const key = `${d.city}|${d.state}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ city: d.city, state: d.state ?? "" });
            }
        }
        return result.sort((a, b) => a.city.localeCompare(b.city));
    }, [deals]);

    const dealZips = useMemo(() => {
        const seen = new Set<string>();
        for (const d of deals) {
            if (d.zipCode) seen.add(d.zipCode);
        }
        return Array.from(seen).sort();
    }, [deals]);

    // Build suggestions from input
    const suggestions = useMemo((): Suggestion[] => {
        const q = inputText.trim().toLowerCase();
        if (q.length < 1) return [];

        const results: Suggestion[] = [];

        // County suggestions
        const countyMatches = COUNTIES
            .filter((c) => c.county.toLowerCase().includes(q) || c.state.toLowerCase().includes(q))
            .slice(0, 4);
        for (const c of countyMatches) {
            const msaName = getMsaNameFromCounty(c.county);
            if (!msaName) continue;
            results.push({
                kind: "county",
                label: `${c.county} County`,
                sublabel: c.state,
                filter: { type: "msa", value: msaName, label: `${c.county} County, ${c.state}`, county: c.county, state: c.state },
            });
        }

        // City suggestions
        const cityMatches = dealCities
            .filter((c) => c.city.toLowerCase().includes(q))
            .slice(0, 4);
        for (const c of cityMatches) {
            results.push({
                kind: "city",
                label: c.city,
                sublabel: c.state,
                filter: { type: "city", value: c.city, label: `${c.city}, ${c.state}` },
            });
        }

        // Zip code suggestions
        const zipMatches = dealZips
            .filter((z) => z.startsWith(inputText.trim()))
            .slice(0, 4);
        for (const z of zipMatches) {
            results.push({
                kind: "zip",
                label: z,
                sublabel: "Zip Code",
                filter: { type: "zip", value: z, label: z },
            });
        }

        return results;
    }, [inputText, dealCities, dealZips]);

    const handleInputChange = (text: string) => {
        setInputText(text);
        if (text.trim().length > 0) {
            setOpen(true);
        } else {
            setOpen(false);
            onChange(null);
        }
    };

    const handleSelect = (suggestion: Suggestion) => {
        setInputText(suggestion.filter.label);
        setOpen(false);
        onChange(suggestion.filter);
    };

    const handleClear = () => {
        setInputText("");
        setOpen(false);
        onChange(null);
    };

    const kindIcon = (kind: Suggestion["kind"]) => {
        if (kind === "county") return <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
        if (kind === "city")   return <MapPin     className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
        return                        <Hash       className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
    };

    const kindLabel = (kind: Suggestion["kind"]) => {
        if (kind === "county") return "County";
        if (kind === "city")   return "City";
        return "Zip";
    };

    return (
        <div ref={wrapperRef} className="relative w-full max-w-xs md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
                type="text"
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
                placeholder="Filter by county, city, or zip..."
                className="w-full h-9 pl-9 pr-7 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            {inputText && (
                <button
                    onClick={handleClear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    <X className="w-4 h-4" />
                </button>
            )}

            {open && suggestions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[260px] bg-popover border border-border rounded-md shadow-md z-[10000] overflow-hidden">
                    {suggestions.map((s, i) => (
                        <button
                            key={i}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left transition-colors"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(s);
                            }}
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                {kindIcon(s.kind)}
                                <span className="font-medium truncate">{s.label}</span>
                                {s.kind !== "zip" && (
                                    <span className="text-muted-foreground text-xs">{s.sublabel}</span>
                                )}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2 flex-shrink-0 bg-muted px-1.5 py-0.5 rounded">
                                {kindLabel(s.kind)}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
