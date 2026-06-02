import { useMemo, useCallback } from 'react';
import { useLocation, useSearch } from 'wouter';

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
