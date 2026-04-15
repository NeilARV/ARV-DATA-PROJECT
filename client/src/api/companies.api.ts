import type { CompanyContactWithCounts } from "@/types/companies";
import type { DirectorySortOption } from "@/types/options";
import { apiRequest } from "@/lib/queryClient";

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
    const { county, page = 1, limit = 50, sort = "most-properties", search = "" } = params;
    const searchParams = new URLSearchParams();
    searchParams.set("page", String(page));
    searchParams.set("limit", String(limit));
    searchParams.set("sort", sort);

    if (county) searchParams.set("county", county);
    if (search.trim()) searchParams.set("search", search.trim());

    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";

    try {
        const res = await apiRequest("GET", `/api/companies${query}`);
        return res.json();
    } catch {
        return null;
    }
}

export async function fetchCompanyById(
    companyId: string,
    options?: { signal?: AbortSignal; county?: string }
): Promise<CompanyContactWithCounts | null> {
    const params = new URLSearchParams();
    if (options?.county?.trim()) params.set("county", options.county.trim());
    const query = params.toString() ? `?${params.toString()}` : "";

    try {
        const res = await apiRequest("GET", `/api/companies/${companyId}${query}`);
        const detail = await res.json();
        return {
            ...detail,
            companyName: detail.companyName ?? "",
            propertyCount: detail.propertyCount ?? 0,
            propertiesSoldCount: detail.propertiesSoldCount ?? 0,
            propertiesSoldCountAllTime: detail.propertiesSoldCountAllTime ?? 0,
        } as CompanyContactWithCounts;
    } catch {
        return null;
    }
}
