import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';

import { useAuth } from '@/hooks/use-auth';

import { getMsaNameFromCounty } from '@/lib/county';

import type { DealTypeFilter } from '@/components/deals/DealsToolbar';
import type { LocationFilter } from '@/types/deals';
import { isDealType, type DealTab } from '@shared/types/deals';

// ── Shared first-load default ───────────────────────────────────────────────
/**
 * Applies a URL default exactly once on first load. Skips permanently when the param is already
 * present (`hasExplicit`), and waits — without consuming the one-shot — until `ready` (the auth
 * user has loaded) so the default reflects the user's county. Shared by the Data and Deals navs.
 */
function useFirstLoadDefault(hasExplicit: boolean, ready: boolean, apply: () => void) {
    const applied = useRef(false);
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        if (applied.current) return;
        if (hasExplicit) {
            applied.current = true;
            return;
        }
        if (!ready) return;
        applied.current = true;
        applyRef.current();
    }, [hasExplicit, ready]);
}

// ── Data nav (/data) ──────────────────────────────────────────────────────────
function buildDataUrl(params: URLSearchParams): string {
    const qs = params.toString();
    return qs ? `/data?${qs}` : '/data';
}

export function useDataNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { user } = useAuth();

    const params = new URLSearchParams(search);
    const county = params.get('county');
    const propertyId = params.get('property');
    const companyId = params.get('company');

    useFirstLoadDefault(county !== null, !!user, () => {
        const p = new URLSearchParams(search);
        p.set('county', user?.county ?? 'San Diego');
        setLocation(buildDataUrl(p), { replace: true });
    });

    const setCounty = useCallback(
        (c: string) => {
            const p = new URLSearchParams(search);
            if (p.get('county') === c) return;
            p.set('county', c);
            p.delete('property');
            p.delete('company');
            setLocation(buildDataUrl(p));
        },
        [search, setLocation],
    );

    const setPropertyId = useCallback(
        (id: string | null) => {
            const p = new URLSearchParams(search);
            const current = p.get('property') ?? null;
            if (current === id) return;
            if (id) p.set('property', id);
            else p.delete('property');
            setLocation(buildDataUrl(p), { replace: true });
        },
        [search, setLocation],
    );

    const setCompanyId = useCallback(
        (id: string | null) => {
            const p = new URLSearchParams(search);
            const current = p.get('company') ?? null;
            if (current === id) return;
            if (id) p.set('company', id);
            else p.delete('company');
            setLocation(buildDataUrl(p), { replace: true });
        },
        [search, setLocation],
    );

    return {
        county: county ?? 'San Diego',
        propertyId,
        companyId,
        setCounty,
        setPropertyId,
        setCompanyId,
    };
}

// ── Deals nav (/deals) ──────────────────────────────────────────────────────
// Rebuilds the query string from scratch — every param must be threaded through here from every
// setter, or changing one filter silently drops the others from the URL.
function buildDealsUrl(
    tab: DealTab,
    filter: LocationFilter | null,
    type: DealTypeFilter,
    dealId?: number | null,
): string {
    const params = new URLSearchParams();
    if (tab === 'mine') params.set('tab', 'mine');
    if (type !== 'all') params.set('type', type);
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

function parseDealsFilter(params: URLSearchParams): LocationFilter | null {
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

    const params = new URLSearchParams(search);
    const rawTab = params.get('tab');
    const tab: DealTab = rawTab === 'mine' ? 'mine' : 'all';
    const rawType = params.get('type');
    const typeFilter: DealTypeFilter = isDealType(rawType) ? rawType : 'all';
    const locationFilter = parseDealsFilter(params);
    const hasExplicitFilter = params.has('filterType');

    const rawDealId = params.get('dealId');
    const dealId: number | null = rawDealId ? Number(rawDealId) || null : null;

    useFirstLoadDefault(hasExplicitFilter, !!user?.county, () => {
        const msaName = getMsaNameFromCounty(user?.county ?? '');
        if (!msaName) return;
        setLocation(buildDealsUrl(tab, { type: 'msa', value: msaName }, typeFilter, dealId), {
            replace: true,
        });
    });

    const setTab = useCallback(
        (newTab: DealTab) => {
            setLocation(buildDealsUrl(newTab, locationFilter, typeFilter, dealId));
        },
        [setLocation, locationFilter, typeFilter, dealId],
    );

    const setTypeFilter = useCallback(
        (type: DealTypeFilter) => {
            setLocation(buildDealsUrl(tab, locationFilter, type, dealId));
        },
        [setLocation, tab, locationFilter, dealId],
    );

    const setLocationFilter = useCallback(
        (filter: LocationFilter | null) => {
            setLocation(buildDealsUrl(tab, filter, typeFilter, dealId));
        },
        [setLocation, tab, typeFilter, dealId],
    );

    const setDealId = useCallback(
        (id: number | null, opts?: { replace?: boolean }) => {
            const p = new URLSearchParams(search);
            if (id !== null) p.set('dealId', String(id));
            else p.delete('dealId');
            const qs = p.toString();
            setLocation(qs ? `/deals?${qs}` : '/deals', opts);
        },
        [search, setLocation],
    );

    return {
        tab,
        typeFilter,
        locationFilter,
        dealId,
        setTab,
        setTypeFilter,
        setLocationFilter,
        setDealId,
    };
}

// ── Vendor nav (/vendors) ───────────────────────────────────────────────────
export type VendorNavView = 'categories' | 'vendor-list' | 'vendor-detail';

export type PostFilters = {
    categoryId?: number;
    vendorId?: string;
};

export function useVendorNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const params = new URLSearchParams(search);

    const rawCategory = params.get('category');
    const rawVendor = params.get('vendor');

    const parsedCategory = rawCategory !== null ? Number(rawCategory) : null;
    const categoryId = parsedCategory !== null && !isNaN(parsedCategory) ? parsedCategory : null;
    const vendorId = rawVendor ?? null;
    const view: VendorNavView =
        vendorId !== null ? 'vendor-detail' : categoryId !== null ? 'vendor-list' : 'categories';

    const reset = useCallback(() => {
        setLocation('/vendors');
    }, [setLocation]);

    const selectCategory = useCallback(
        (id: number) => {
            setLocation(`/vendors?category=${id}`);
        },
        [setLocation],
    );

    const selectVendor = useCallback(
        (id: string) => {
            if (categoryId !== null) {
                setLocation(`/vendors?category=${categoryId}&vendor=${id}`);
            } else {
                setLocation(`/vendors?vendor=${id}`);
            }
        },
        [setLocation, categoryId],
    );

    const goBack = useCallback(() => {
        if (vendorId && categoryId !== null) {
            setLocation(`/vendors?category=${categoryId}`);
        } else {
            setLocation('/vendors');
        }
    }, [setLocation, categoryId, vendorId]);

    const postFilters: PostFilters = useMemo(
        () => ({
            categoryId: vendorId ? undefined : (categoryId ?? undefined),
            vendorId: vendorId ?? undefined,
        }),
        [categoryId, vendorId],
    );

    return {
        view,
        categoryId,
        vendorId,
        selectCategory,
        selectVendor,
        goBack,
        reset,
        postFilters,
    };
}
