import { MAX_PRICE } from "@/constants/filters.constants";
import type { PropertyFilters } from "@/types/filters";
import type { SortOption } from "@/types/options";
import { getEffectiveStatusFilters } from "@/lib/propertyFilters";
import { useCompanies } from "@/hooks/useCompanies";

export type BuildPropertyQueryParamsOptions = {
  /** When true, only county and status filters are included (for map pins endpoint). */
  forMapPins?: boolean;
  /** When true, append hasDateSold=true (for buyers feed). */
  hasDateSold?: boolean;
  page: number;
  limit: string;
  sortBy: SortOption;
};

/**
 * Builds query string for properties API from filters and options.
 * Returns "" when no params, or "?key=value&..." when there are params.
 * Use forMapPins for /api/properties/map (county + status only).
 * Use hasDateSold for buyers feed.
 */
export function buildPropertyQueryParams(
  filters: PropertyFilters,
  options: BuildPropertyQueryParamsOptions
): string {
  const {
    forMapPins = false,
    hasDateSold = false,
    page,
    limit,
    sortBy,
  } = options;

  const { company } = useCompanies();

  const params = new URLSearchParams();

  // County filter
  if (filters.county) {
    params.append("county", filters.county);
  }

  // Status filters (effective list includes wholesale when in-renovation selected and no company)
  const effectiveStatuses = getEffectiveStatusFilters(
    filters,
    company?.id ?? null
  );
  effectiveStatuses.forEach((status) => params.append("status", status));

  // Map pins: only county + status
  if (forMapPins) {
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  // Full filters for properties list / buyers feed
  if (filters.zipCode && filters.zipCode.trim() !== "") {
    params.append("zipcode", filters.zipCode.trim());
  }
  if (filters.city && filters.city.trim() !== "") {
    params.append("city", filters.city.trim());
  }
  if (filters.minPrice > 0) {
    params.append("minPrice", filters.minPrice.toString());
  }
  if (filters.maxPrice < MAX_PRICE) {
    params.append("maxPrice", filters.maxPrice.toString());
  }
  if (filters.bedrooms && filters.bedrooms !== "Any") {
    params.append("bedrooms", filters.bedrooms.replace("+", ""));
  }
  if (filters.bathrooms && filters.bathrooms !== "Any") {
    params.append("bathrooms", filters.bathrooms.replace("+", ""));
  }
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    filters.propertyTypes.forEach((type) =>
      params.append("propertyType", type)
    );
  }

  if (company?.id) {
    params.append("companyId", company.id);
  } else if (company?.companyName) {
    params.append("company", company.companyName);
  }

  if (hasDateSold) {
    params.append("hasDateSold", "true");
  }

  params.append("page", page.toString());
  params.append("limit", limit);
  params.append("sortBy", sortBy);

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
