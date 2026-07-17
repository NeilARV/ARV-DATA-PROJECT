import type { GroupDirectoryResponse, GroupDirectoryRow, GroupProfile } from '@shared/types/groups';
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

/**
 * One group's directory row for ?group= deep-link validation.
 * @returns null when the group is stale for the current view (disbanded, under two members, or no
 *   activity in the selected counties) or the request fails.
 */
export async function fetchGroupDirectoryRow(
    groupId: string,
    params: { counties?: string[]; sort?: DirectorySortOption },
): Promise<GroupDirectoryRow | null> {
    const searchParams = new URLSearchParams();
    params.counties?.forEach((county) => searchParams.append('county', county));
    if (params.sort) searchParams.set('sort', params.sort);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';

    try {
        const res = await apiRequest('GET', `/api/companies/groups/${groupId}${query}`);
        const data = await res.json();
        return data.group ?? null;
    } catch {
        return null;
    }
}

/**
 * One group's aggregate profile for the expanded group card.
 * @returns null when the group is stale (disbanded, under two members) or the request fails.
 */
export async function fetchGroupProfile(groupId: string): Promise<GroupProfile | null> {
    try {
        const res = await apiRequest('GET', `/api/companies/groups/${groupId}/profile`);
        const data = await res.json();
        return data.profile ?? null;
    } catch {
        return null;
    }
}
