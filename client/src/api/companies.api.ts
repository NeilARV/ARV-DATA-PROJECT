import type { CompanyContactWithCounts } from "@/types/companies";
import type { DirectorySortOption } from "@/types/options";

export type CompaniesPageResponse = {
  companies: CompanyContactWithCounts[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchCompanyContactsPage(
  params: {
    county?: string;
    page?: number;
    limit?: number;
    sort?: DirectorySortOption;
    search?: string;
    signal?: AbortSignal;
  }
): Promise<CompaniesPageResponse | null> {
  const { county, page = 1, limit = 50, sort = "most-properties", search = "", signal } = params;
  const searchParams = new URLSearchParams();
  if (county) searchParams.set("county", county);
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));
  searchParams.set("sort", sort);
  if (search.trim()) searchParams.set("search", search.trim());
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const response = await fetch(`/api/companies/contacts${query}`, {
    credentials: "include",
    signal,
  });

  if (response.ok) {
    return response.json();
  }

  return null;
}

export async function fetchCompanyById(
  companyId: string,
  options?: { signal?: AbortSignal }
): Promise<CompanyContactWithCounts | null> {
  const response = await fetch(`/api/companies/${companyId}`, {
    credentials: "include",
    signal: options?.signal,
  });

  if (response.ok) {
    const detail = await response.json();
    return {
      ...detail,
      companyName: detail.companyName ?? "",
      propertyCount: detail.propertyCount ?? 0,
      propertiesSoldCount: detail.propertiesSoldCount ?? 0,
      propertiesSoldCountAllTime: detail.propertiesSoldCountAllTime ?? 0,
    } as CompanyContactWithCounts;
  }

  return null;
}