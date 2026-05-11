import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { CategoryCard } from "./CategoryCard";
import { VendorCard } from "./VendorCard";
import { fetchCategories, fetchVendors } from "@/api/vendors.api";
import type { Category, Vendor } from "@/types/vendors";
import type { VendorNavView, Breadcrumb } from "@/hooks/useVendorNav";

type BrowseByCategoryProps = {
    view: VendorNavView;
    selectedCategory: Category | null;
    selectedVendor: Vendor | null;
    breadcrumbs: Breadcrumb[];
    onSelectCategory: (category: Category) => void;
    onSelectVendor: (vendor: Vendor) => void;
    onGoBack: () => void;
};

export function BrowseByCategory({
    view,
    selectedCategory,
    selectedVendor,
    breadcrumbs,
    onSelectCategory,
    onSelectVendor,
    onGoBack,
}: BrowseByCategoryProps) {
    const { data: categories, isLoading: categoriesLoading } = useQuery({
        queryKey: ["categories"],
        queryFn: fetchCategories,
        staleTime: 5 * 60 * 1000,
    });

    const { data: vendors, isLoading: vendorsLoading } = useQuery({
        queryKey: ["vendors", selectedCategory?.id],
        queryFn: () => fetchVendors([selectedCategory!.id]),
        enabled: view === "vendor-list" && selectedCategory !== null,
        staleTime: 5 * 60 * 1000,
    });

    return (
        <div className="flex flex-col h-full">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="font-semibold text-foreground">Browse by Category</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onGoBack}
                        className={`h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground ${view !== "vendor-list" ? "invisible pointer-events-none" : ""}`}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Back
                    </Button>
                </div>

                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    {breadcrumbs.map((crumb, i) => (
                        <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="w-3 h-3" />}
                            <button
                                onClick={crumb.onClick}
                                className={i === breadcrumbs.length - 1 ? "text-foreground font-medium" : "hover:text-foreground transition-colors"}
                            >
                                {crumb.label}
                            </button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {view === "categories" && (
                    categoriesLoading ? (
                        <div className="grid grid-cols-3 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {(categories ?? []).map((cat) => (
                                <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />
                            ))}
                        </div>
                    )
                )}

                {view === "vendor-list" && (
                    vendorsLoading ? (
                        <div className="grid grid-cols-3 gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : !vendors || vendors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <p className="text-sm text-muted-foreground">No vendors in this category yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {vendors.map((vendor) => (
                                <VendorCard
                                    key={vendor.id}
                                    vendor={vendor}
                                    isSelected={selectedVendor?.id === vendor.id}
                                    onClick={onSelectVendor}
                                />
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
