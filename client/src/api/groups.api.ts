import type { GroupDirectoryResponse } from '@shared/types/groups';
import type { DirectorySortOption } from '@/types/options';
import { apiRequest } from '@/lib/queryClient';

/** One page of the public groups directory (Data-app Groups tab). Mirrors fetchCompanyContactsPage. */
export async function fetchGroupDirectoryPage(params: {
    counties?: string[];
    page?: number;
    limit?: number;
    sort?: DirectorySortOption;
    search?: string;
    signal?: AbortSignal;
}): Promise<GroupDirectoryResponse | null> {
    const { counties = [], page = 1, limit = 50, sort = 'most-properties', search = '' } = params;
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(page));
    searchParams.set('limit', String(limit));
    searchParams.set('sort', sort);

    counties.forEach((county) => searchParams.append('county', county));
    if (search.trim()) searchParams.set('search', search.trim());

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

    try {
        const res = await apiRequest('GET', `/api/companies/groups${query}`);
        return res.json();
    } catch {
        return null;
    }
}
