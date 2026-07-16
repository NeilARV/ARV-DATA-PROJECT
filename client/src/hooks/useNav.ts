import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';

import { useAuth } from '@/hooks/use-auth';

import {
    DEFAULT_MSA_COUNTY_SELECTION,
    defaultSelectionForUser,
    isSameSelection,
    parseLegacyDealsFilterParams,
    parseMsaCountyParams,
    writeMsaCountyParams,
} from '@/lib/msaCountySelection';

import type { MsaCountySelection } from '@/types/filters';
import type { DealTab } from '@shared/types/deals';

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
    const parsedSelection = parseMsaCountyParams(params);
    const propertyId = params.get('property');
    const companyId = params.get('company');

    useFirstLoadDefault(parsedSelection !== null, !!user, () => {
        const p = new URLSearchParams(search);
        writeMsaCountyParams(p, defaultSelectionForUser(user?.county, user?.countySubscriptions));
        setLocation(buildDataUrl(p), { replace: true });
    });

    const setSelection = useCallback(
        (selection: MsaCountySelection) => {
            const p = new URLSearchParams(search);
            const current = parseMsaCountyParams(p);
            if (current && isSameSelection(current, selection)) return;
            writeMsaCountyParams(p, selection);
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
        selection: parsedSelection ?? DEFAULT_MSA_COUNTY_SELECTION,
        propertyId,
        companyId,
        setSelection,
        setPropertyId,
        setCompanyId,
    };
}

// ── Deals nav (/deals) ──────────────────────────────────────────────────────
function buildDealsUrl(params: URLSearchParams): string {
    const qs = params.toString();
    return qs ? `/deals?${qs}` : '/deals';
}

// Legacy ?filterType= deep links (old deal emails) still resolve to a selection.
function parseDealsSelection(params: URLSearchParams): MsaCountySelection | null {
    return parseMsaCountyParams(params) ?? parseLegacyDealsFilterParams(params);
}

export function useDealsNav() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { user } = useAuth();

    const params = new URLSearchParams(search);
    const rawTab = params.get('tab');
    const tab: DealTab = rawTab === 'mine' ? 'mine' : 'all';
    const parsedSelection = parseDealsSelection(params);

    const rawDealId = params.get('dealId');
    const dealId: number | null = rawDealId ? Number(rawDealId) || null : null;

    useFirstLoadDefault(parsedSelection !== null, !!user, () => {
        const p = new URLSearchParams(search);
        writeMsaCountyParams(p, defaultSelectionForUser(user?.county, user?.countySubscriptions));
        setLocation(buildDealsUrl(p), { replace: true });
    });

    const setSelection = useCallback(
        (selection: MsaCountySelection) => {
            const p = new URLSearchParams(search);
            const current = parseDealsSelection(p);
            if (current && isSameSelection(current, selection)) return;
            writeMsaCountyParams(p, selection);
            setLocation(buildDealsUrl(p));
        },
        [search, setLocation],
    );

    const setTab = useCallback(
        (newTab: DealTab) => {
            const p = new URLSearchParams(search);
            if (newTab === 'mine') p.set('tab', 'mine');
            else p.delete('tab');
            setLocation(buildDealsUrl(p));
        },
        [search, setLocation],
    );

    const setDealId = useCallback(
        (id: number | null) => {
            const p = new URLSearchParams(search);
            if (id !== null) p.set('dealId', String(id));
            else p.delete('dealId');
            setLocation(buildDealsUrl(p));
        },
        [search, setLocation],
    );

    return {
        tab,
        selection: parsedSelection ?? DEFAULT_MSA_COUNTY_SELECTION,
        dealId,
        setTab,
        setSelection,
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
