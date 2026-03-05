import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { getDefaultFilters } from "@/lib/propertyFilters";
import { MAX_PRICE } from "@/constants/filters.constants";
import { PROPERTY_STATUS } from "@/constants/propertyStatus.constants";
import type { PropertyFilters } from "@/types/filters";
import type { SortOption } from "@/types/options";

export interface FiltersContextValue {
  filters: PropertyFilters;
  setFilters: React.Dispatch<React.SetStateAction<PropertyFilters>>;
  clearFilters: (overrides?: Partial<PropertyFilters>) => void;
  hasActiveFilters: boolean;
  sortBy: SortOption;
  setSortBy: React.Dispatch<React.SetStateAction<SortOption>>;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

export interface FiltersProviderProps {
  children: ReactNode;
  /** Optional initial overrides for default filters (e.g. from URL) */
  defaultOverrides?: Partial<PropertyFilters>;
}

/**
 * Provides filter state to the tree. Use useFilters() in any descendant to read/update filters
 * without prop drilling. Defaults are applied automatically.
 */
export function FiltersProvider({ children, defaultOverrides }: FiltersProviderProps) {
  const [filters, setFilters] = useState<PropertyFilters>(() =>
    getDefaultFilters(defaultOverrides)
  );

  const [ sortBy, setSortBy ] = useState<SortOption>("recently-sold");

  const hasActiveFilters = useMemo(() => {
    return (
      filters.minPrice > 0 ||
      filters.maxPrice < MAX_PRICE ||
      filters.bedrooms !== "Any" ||
      filters.bathrooms !== "Any" ||
      filters.propertyTypes.length > 0 ||
      filters.zipCode !== "" ||
      filters.city !== undefined ||
      filters.statusFilters.length !== 1 ||
      filters.statusFilters[0] !== PROPERTY_STATUS.IN_RENOVATION
    );
  }, [filters]);

  const clearFilters = useCallback((overrides?: Partial<PropertyFilters>) => {
    setFilters(getDefaultFilters({ ...overrides, county: filters.county}));
  }, [filters.county]);

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      setFilters,
      clearFilters,
      hasActiveFilters,
      sortBy,
      setSortBy,
    }),
    [filters, clearFilters, hasActiveFilters, sortBy]
  );

  return (
    <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>
  );
}

/**
 * Access filter state and setters from anywhere inside FiltersProvider.
 * Throws if used outside a FiltersProvider.
 */
export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) {
    throw new Error("useFilters must be used within a FiltersProvider");
  }
  return ctx;
}
