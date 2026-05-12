import { useState, useMemo, useRef } from "react";
import { X, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updatePost, fetchCategories, fetchVendors, uploadPostImage, deletePostImage } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";
import type { Post } from "@/types/vendors";

const MAX_IMAGES = 5;

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
    const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const existingImages = post.images.filter((img) => !imagesToDelete.includes(img.id));
    const totalImages = existingImages.length + pendingFiles.length;

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
        mutationFn: async () => {
            await updatePost(post.id, {
                title,
                content,
                city: city.trim() || undefined,
                state: state.trim() || undefined,
                categoryIds: selectedCategoryIds,
                vendorIds: selectedVendorIds,
            });
            await Promise.all([
                ...imagesToDelete.map((id) => deletePostImage(post.id, id)),
                ...pendingFiles.map((file) => uploadPostImage(post.id, file)),
            ]);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
            toast({ title: "Post updated", description: "Your post has been saved." });
            previews.forEach((url) => URL.revokeObjectURL(url));
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
        previews.forEach((url) => URL.revokeObjectURL(url));
        setPendingFiles([]);
        setPreviews([]);
        setImagesToDelete([]);
        onClose();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        const slots = MAX_IMAGES - totalImages;
        const toAdd = files.slice(0, slots);
        setPendingFiles((prev) => [...prev, ...toAdd]);
        setPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
        e.target.value = "";
    };

    const removePending = (index: number) => {
        URL.revokeObjectURL(previews[index]);
        setPendingFiles((prev) => prev.filter((_, i) => i !== index));
        setPreviews((prev) => prev.filter((_, i) => i !== index));
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

                    {/* Photos */}
                    <div className="space-y-1.5">
                        <Label>Photos</Label>
                        {(existingImages.length > 0 || previews.length > 0) && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {existingImages.map((img) => (
                                    <div key={img.id} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                                        <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setImagesToDelete((prev) => [...prev, img.id])}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                        >
                                            <X className="w-2.5 h-2.5 text-white" />
                                        </button>
                                    </div>
                                ))}
                                {previews.map((src, i) => (
                                    <div key={`new-${i}`} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                                        <img src={src} alt="" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removePending(i)}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                        >
                                            <X className="w-2.5 h-2.5 text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {totalImages < MAX_IMAGES && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded-md px-3 py-2 w-full justify-center"
                                >
                                    <ImagePlus className="w-3.5 h-3.5" />
                                    Add photos ({totalImages}/{MAX_IMAGES})
                                </button>
                            </>
                        )}
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
