import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { getMsaNameFromCounty } from '@/lib/county';
import type { LocationFilter } from '@/components/deals/DealsLocationSearch';

function buildDealsUrl(
    tab: DealTab,
    filter: LocationFilter | null,
    dealId?: number | null,
): string {
    const params = new URLSearchParams();
    if (tab === 'mine') params.set('tab', 'mine');
    if (filter) {
        params.set('filterType', filter.type);
        params.set('filterValue', filter.value);
        if (filter.type === 'county' || filter.type === 'city')
            params.set('filterState', filter.state);
    }
    if (dealId != null) params.set('dealId', String(dealId));
    const qs = params.toString();
    return qs ? `/deals?${qs}` : '/deals';
}

function parseFilter(params: URLSearchParams): LocationFilter | null {
    const type = params.get('filterType');
    const value = params.get('filterValue');
    if (!type || !value) return null;
    if (type === 'county') {
        const state = params.get('filterState') ?? '';
        return { type: 'county', value, state };
    }
    if (type === 'msa') return { type: 'msa', value };
    if (type === 'city') {
        const state = params.get('filterState') ?? '';
        return { type: 'city', value, state };
    }
    if (type === 'zip') return { type: 'zip', value };
    return null;
}

export function useDealsNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { user } = useAuth();
    const defaultApplied = useRef(false);

    const params = new URLSearchParams(search);
    const rawTab = params.get('tab');
    const tab: DealTab = rawTab === 'mine' ? 'mine' : 'all';
    const locationFilter = parseFilter(params);
    const hasExplicitFilter = params.has('filterType');

    const rawDealId = params.get('dealId');
    const dealId: number | null = rawDealId ? Number(rawDealId) || null : null;

    // On first load when no filter is set, default to user's county
    useEffect(() => {
        if (defaultApplied.current) return;
        if (hasExplicitFilter) {
            defaultApplied.current = true;
            return;
        }
        if (!user?.county) return;
        const msaName = getMsaNameFromCounty(user.county);
        if (!msaName) {
            defaultApplied.current = true;
            return;
        }
        defaultApplied.current = true;
        const filter: LocationFilter = { type: 'msa', value: msaName };
        setLocation(buildDealsUrl(tab, filter, dealId), { replace: true });
    }, [user?.county, hasExplicitFilter, tab, dealId, setLocation]);

    const setTab = useCallback(
        (newTab: DealTab) => {
            setLocation(buildDealsUrl(newTab, locationFilter, dealId));
        },
        [setLocation, locationFilter, dealId],
    );

    const setLocationFilter = useCallback(
        (filter: LocationFilter | null) => {
            setLocation(buildDealsUrl(tab, filter, dealId));
        },
        [setLocation, tab, dealId],
    );

    const setDealId = useCallback(
        (id: number | null) => {
            const p = new URLSearchParams(search);
            if (id !== null) p.set('dealId', String(id));
            else p.delete('dealId');
            const qs = p.toString();
            setLocation(qs ? `/deals?${qs}` : '/deals');
        },
        [search, setLocation],
    );

    return { tab, locationFilter, dealId, setTab, setLocationFilter, setDealId };
}
