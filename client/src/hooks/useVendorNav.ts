import { useState, useMemo, useCallback } from "react";
import type { Category, Vendor } from "@/types/vendors";

export type VendorNavView = "categories" | "vendor-list";

export type Breadcrumb = {
    label: string;
    onClick: () => void;
};

export type PostFilters = {
    categoryId?: number;
    vendorId?: string;
};

export function useVendorNav() {
    const [view, setView] = useState<VendorNavView>("categories");
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

    const reset = useCallback(() => {
        setView("categories");
        setSelectedCategory(null);
        setSelectedVendor(null);
    }, []);

    const selectCategory = useCallback((category: Category) => {
        setSelectedCategory(category);
        setSelectedVendor(null);
        setView("vendor-list");
    }, []);

    const selectVendor = useCallback((vendor: Vendor) => {
        setSelectedVendor((prev) => (prev?.id === vendor.id ? null : vendor));
    }, []);

    const goBack = useCallback(() => {
        setSelectedVendor((prev) => {
            if (prev) return null;
            setView("categories");
            setSelectedCategory(null);
            return null;
        });
    }, []);

    const postFilters: PostFilters = useMemo(() => ({
        categoryId: selectedVendor ? undefined : selectedCategory?.id,
        vendorId: selectedVendor?.id,
    }), [selectedVendor, selectedCategory]);

    const breadcrumbs: Breadcrumb[] = useMemo(() => {
        if (!selectedCategory) return [];
        const crumbs: Breadcrumb[] = [{ label: "Categories", onClick: reset }];
        if (selectedVendor) {
            crumbs.push({
                label: `${selectedCategory.name} Vendors`,
                onClick: () => setSelectedVendor(null),
            });
        }
        return crumbs;
    }, [selectedCategory, selectedVendor, reset]);

    return {
        view,
        selectedCategory,
        selectedVendor,
        selectCategory,
        selectVendor,
        goBack,
        reset,
        postFilters,
        breadcrumbs,
    };
}
