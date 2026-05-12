import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { CategoryCard } from "./CategoryCard";
import { VendorCard } from "./VendorCard";
import { AddVendorDialog } from "./AddVendorDialog";
import { fetchCategories, fetchVendors } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
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
    const [showAddVendor, setShowAddVendor] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { isAdmin, isOwner } = useAuth();
    const isPrivileged = isAdmin || isOwner;

    const q = searchQuery.trim().toLowerCase();
    const isSearching = q.length > 0;

    const { data: categories, isLoading: categoriesLoading } = useQuery({
        queryKey: ["categories"],
        queryFn: fetchCategories,
        staleTime: 5 * 60 * 1000,
    });

    const { data: vendors, isLoading: vendorsLoading } = useQuery({
        queryKey: ["vendors", selectedCategory?.id],
        queryFn: () => fetchVendors([selectedCategory!.id]),
        enabled: view === "vendor-list" && selectedCategory !== null && !isSearching,
        staleTime: 5 * 60 * 1000,
    });

    const { data: allVendors, isLoading: allVendorsLoading } = useQuery({
        queryKey: ["vendors"],
        queryFn: () => fetchVendors(),
        enabled: isSearching,
        staleTime: 5 * 60 * 1000,
    });

    const filteredCategories = isSearching
        ? (categories ?? []).filter((c) => c.name.toLowerCase().includes(q))
        : [];

    const filteredVendors = isSearching
        ? (allVendors ?? []).filter(
              (v) =>
                  v.name.toLowerCase().includes(q) ||
                  v.description?.toLowerCase().includes(q) ||
                  v.city?.toLowerCase().includes(q)
          )
        : [];

    const searchInput = (
        <div className="relative w-full max-w-xs md:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories & vendors..."
                className="w-full h-8 pl-7 pr-6 text-xs bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
            {searchQuery && (
                <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );

    return (
        <>
        <div className="flex flex-col h-full">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">

                {/* Desktop: single items-center row — title+breadcrumbs left, search center, button right */}
                <div className="hidden sm:flex items-center gap-3">
                    {/* Left: title + breadcrumbs stacked */}
                    <div className="flex-shrink-0">
                        <div className="h-7 flex items-center gap-2">
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
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 min-h-[16px]">
                            {!isSearching && breadcrumbs.map((crumb, i) => (
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

                    {/* Center: search — constrained width, centered in available space */}
                    <div className="flex-1 flex justify-center min-w-0">
                        {searchInput}
                    </div>

                    {/* Right: Add Vendor */}
                    {isPrivileged && (
                        <Button
                            size="sm"
                            onClick={() => setShowAddVendor(true)}
                            className="h-7 gap-1 text-xs flex-shrink-0"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Vendor
                        </Button>
                    )}
                </div>

                {/* Mobile: title row, breadcrumbs, then search below */}
                <div className="sm:hidden">
                    <div className="h-7 flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
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
                        {isPrivileged && (
                            <Button
                                size="sm"
                                onClick={() => setShowAddVendor(true)}
                                className="h-7 gap-1 text-xs"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Add Vendor
                            </Button>
                        )}
                    </div>
                    {!isSearching && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
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
                    )}
                    <div className="mt-2 flex justify-center">{searchInput}</div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">

                {/* Search results */}
                {isSearching && (
                    allVendorsLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : filteredCategories.length === 0 && filteredVendors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <p className="text-sm text-muted-foreground">No results for &ldquo;{searchQuery.trim()}&rdquo;</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {filteredCategories.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                        Categories ({filteredCategories.length})
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                                        {filteredCategories.map((cat) => (
                                            <CategoryCard key={cat.id} category={cat} onClick={(cat) => { setSearchQuery(""); onSelectCategory(cat); }} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {filteredVendors.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                        Vendors ({filteredVendors.length})
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                                        {filteredVendors.map((vendor) => (
                                            <VendorCard
                                                key={vendor.id}
                                                vendor={vendor}
                                                isSelected={selectedVendor?.id === vendor.id}
                                                onClick={(v) => { setSearchQuery(""); onSelectVendor(v); }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                )}

                {/* Normal category browse */}
                {!isSearching && view === "categories" && (
                    categoriesLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {(categories ?? []).map((cat) => (
                                <CategoryCard key={cat.id} category={cat} onClick={onSelectCategory} />
                            ))}
                        </div>
                    )
                )}

                {/* Normal vendor list */}
                {!isSearching && view === "vendor-list" && (
                    vendorsLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : !vendors || vendors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center">
                            <p className="text-sm text-muted-foreground">No vendors in this category yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
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

        <AddVendorDialog
            open={showAddVendor}
            onClose={() => setShowAddVendor(false)}
            initialCategoryId={view === "vendor-list" ? selectedCategory?.id : undefined}
        />
        </>
    );
}
