import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updatePost, fetchCategories, fetchVendors } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";
import type { Post } from "@/types/vendors";

type EditPostDialogProps = {
    open: boolean;
    onClose: () => void;
    post: Post;
};

export function EditPostDialog({ open, onClose, post }: EditPostDialogProps) {
    const [title, setTitle] = useState(post.title);
    const [content, setContent] = useState(post.content);
    const [city, setCity] = useState(post.city ?? "");
    const [state, setState] = useState(post.state ?? "");
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
        post.categories.map((c) => c.id)
    );
    const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>(
        post.vendorTags.map((v) => v.id)
    );
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: categoriesData } = useQuery({
        queryKey: ["categories"],
        queryFn: fetchCategories,
        staleTime: 5 * 60 * 1000,
    });

    const { data: vendorsData } = useQuery({
        queryKey: ["vendors-for-post", selectedCategoryIds],
        queryFn: () => fetchVendors(selectedCategoryIds),
        enabled: selectedCategoryIds.length > 0,
        staleTime: 5 * 60 * 1000,
    });

    // Vendor name lookup: seed from post data so pills show immediately before query loads
    const vendorNameMap = useMemo(() => {
        const map = new Map<string, string>();
        post.vendorTags.forEach((v) => map.set(v.id, v.name));
        vendorsData?.forEach((v) => map.set(v.id, v.name));
        return map;
    }, [post.vendorTags, vendorsData]);

    const mutation = useMutation({
        mutationFn: () =>
            updatePost(post.id, {
                title,
                content,
                city: city.trim() || undefined,
                state: state.trim() || undefined,
                categoryIds: selectedCategoryIds,
                vendorIds: selectedVendorIds,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
            toast({ title: "Post updated", description: "Your post has been saved." });
            onClose();
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to update post.",
                variant: "destructive",
            });
        },
    });

    const handleClose = () => {
        if (mutation.isPending) return;
        onClose();
    };

    const addCategory = (id: number) => {
        setSelectedCategoryIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };

    const removeCategory = (id: number) => {
        const remaining = selectedCategoryIds.filter((c) => c !== id);
        setSelectedCategoryIds(remaining);
        if (vendorsData) {
            setSelectedVendorIds((prev) =>
                prev.filter((vendorId) => {
                    const vendor = vendorsData.find((v) => v.id === vendorId);
                    return vendor?.categories.some((c) => remaining.includes(c.id)) ?? false;
                })
            );
        }
    };

    const addVendor = (id: string) => {
        setSelectedVendorIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    };

    const removeVendor = (id: string) => {
        setSelectedVendorIds((prev) => prev.filter((v) => v !== id));
    };

    const availableCategories = (categoriesData ?? []).filter((c) => !selectedCategoryIds.includes(c.id));
    const availableVendors = (vendorsData ?? []).filter((v) => !selectedVendorIds.includes(v.id));

    const selectClass =
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-muted-foreground cursor-pointer";

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit Post</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-post-title">Title</Label>
                        <Input
                            id="edit-post-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Give your post a title"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-post-content">Content</Label>
                        <Textarea
                            id="edit-post-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Share your project update..."
                            rows={4}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-post-city">City</Label>
                            <Input
                                id="edit-post-city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="San Diego"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-post-state">State</Label>
                            <Input
                                id="edit-post-state"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="CA"
                                maxLength={2}
                            />
                        </div>
                    </div>

                    {/* Categories */}
                    <div className="space-y-1.5">
                        <Label>Categories</Label>
                        {availableCategories.length > 0 && (
                            <select
                                value=""
                                onChange={(e) => { if (e.target.value) addCategory(Number(e.target.value)); }}
                                className={selectClass}
                            >
                                <option value="">Add a category...</option>
                                {availableCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        )}
                        {selectedCategoryIds.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedCategoryIds.map((id) => {
                                    const cat = categoriesData?.find((c) => c.id === id)
                                        ?? post.categories.find((c) => c.id === id);
                                    return cat ? (
                                        <span
                                            key={id}
                                            className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md"
                                        >
                                            {cat.name}
                                            <button
                                                type="button"
                                                onClick={() => removeCategory(id)}
                                                className="hover:text-destructive transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </div>

                    {/* Vendors */}
                    {selectedCategoryIds.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Vendors</Label>
                            {availableVendors.length > 0 ? (
                                <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) addVendor(e.target.value); }}
                                    className={selectClass}
                                >
                                    <option value="">Add a vendor...</option>
                                    {availableVendors.map((vendor) => (
                                        <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                                    ))}
                                </select>
                            ) : vendorsData !== undefined && vendorsData.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No vendors found for the selected categories.</p>
                            ) : null}
                            {selectedVendorIds.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {selectedVendorIds.map((id) => {
                                        const name = vendorNameMap.get(id);
                                        return name ? (
                                            <span
                                                key={id}
                                                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md"
                                            >
                                                {name}
                                                <button
                                                    type="button"
                                                    onClick={() => removeVendor(id)}
                                                    className="hover:text-destructive transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mutation.mutate()}
                            disabled={!title.trim() || !content.trim() || mutation.isPending}
                        >
                            {mutation.isPending ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
