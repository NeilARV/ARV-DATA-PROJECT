import { useState, useRef } from "react";
import { X, ImagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPost, fetchCategories, fetchVendors, uploadPostImage } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";
import { createPostSchema } from "@database/validation/posts.validation";
import type { ZodFormattedError } from "zod";

const MAX_IMAGES = 5;

type CreatePostDialogProps = {
    open: boolean;
    onClose: () => void;
};

export function CreatePostDialog({ open, onClose }: CreatePostDialogProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [attempted, setAttempted] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<ZodFormattedError<{ title: string; content: string; city?: string; state?: string }> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const validate = (values: { title: string; content: string; city: string; state: string }) => {
        const result = createPostSchema.safeParse({
            title:   values.title,
            content: values.content,
            city:    values.city.trim()  || undefined,
            state:   values.state.trim() || undefined,
        });
        if (!result.success) {
            setFieldErrors(result.error.format() as typeof fieldErrors);
            return false;
        }
        setFieldErrors(null);
        return true;
    };

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

    const mutation = useMutation({
        mutationFn: async () => {
            const post = await createPost({
                title,
                content,
                city:        city.trim()  || undefined,
                state:       state.trim() || undefined,
                categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
                vendorIds:   selectedVendorIds.length > 0 ? selectedVendorIds : undefined,
            });
            if (pendingFiles.length > 0) {
                await Promise.all(pendingFiles.map((file) => uploadPostImage(post.id, file)));
            }
            return post;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
            toast({ title: "Post created", description: "Your post has been shared with the community." });
            resetForm();
            onClose();
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to create post. Make sure you have the required access.",
                variant: "destructive",
            });
        },
    });

    const resetForm = () => {
        setTitle("");
        setContent("");
        setCity("");
        setState("");
        setSelectedCategoryIds([]);
        setSelectedVendorIds([]);
        previews.forEach((url) => URL.revokeObjectURL(url));
        setPendingFiles([]);
        setPreviews([]);
        setAttempted(false);
        setFieldErrors(null);
    };

    const handleClose = () => {
        if (mutation.isPending) return;
        resetForm();
        onClose();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        const slots = MAX_IMAGES - pendingFiles.length;
        const toAdd = files.slice(0, slots);
        setPendingFiles((prev) => [...prev, ...toAdd]);
        setPreviews((prev) => [...prev, ...toAdd.map((f) => URL.createObjectURL(f))]);
        e.target.value = "";
    };

    const removeFile = (index: number) => {
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
                    <DialogTitle>New Post</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="post-title">Title <span className="text-destructive">*</span></Label>
                        <Input
                            id="post-title"
                            value={title}
                            onChange={(e) => { setTitle(e.target.value); if (attempted) validate({ title: e.target.value, content, city, state }); }}
                            placeholder="Give your post a title"
                            className={fieldErrors?.title ? "border-destructive" : ""}
                        />
                        {fieldErrors?.title?._errors[0] && (
                            <p className="text-xs text-destructive">{fieldErrors.title._errors[0]}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="post-content">Content <span className="text-destructive">*</span></Label>
                        <Textarea
                            id="post-content"
                            value={content}
                            onChange={(e) => { setContent(e.target.value); if (attempted) validate({ title, content: e.target.value, city, state }); }}
                            placeholder="Share your project update, renovation tips, or flip story..."
                            rows={4}
                            className={fieldErrors?.content ? "border-destructive" : ""}
                        />
                        {fieldErrors?.content?._errors[0] && (
                            <p className="text-xs text-destructive">{fieldErrors.content._errors[0]}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="post-city">City</Label>
                            <Input
                                id="post-city"
                                value={city}
                                onChange={(e) => { setCity(e.target.value); if (attempted) validate({ title, content, city: e.target.value, state }); }}
                                placeholder="San Diego"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="post-state">State</Label>
                            <Input
                                id="post-state"
                                value={state}
                                onChange={(e) => { setState(e.target.value); if (attempted) validate({ title, content, city, state: e.target.value }); }}
                                placeholder="CA"
                                maxLength={2}
                                className={fieldErrors?.state ? "border-destructive" : ""}
                            />
                            {fieldErrors?.state?._errors[0] && (
                                <p className="text-xs text-destructive">{fieldErrors.state._errors[0]}</p>
                            )}
                        </div>
                    </div>

                    {/* Photos */}
                    <div className="space-y-1.5">
                        <Label>Photos</Label>
                        {previews.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {previews.map((src, i) => (
                                    <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                                        <img src={src} alt="" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeFile(i)}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                                        >
                                            <X className="w-2.5 h-2.5 text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {pendingFiles.length < MAX_IMAGES && (
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
                                    Add photos ({pendingFiles.length}/{MAX_IMAGES})
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
                                    const cat = categoriesData?.find((c) => c.id === id);
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
                                        const vendor = vendorsData?.find((v) => v.id === id);
                                        return vendor ? (
                                            <span
                                                key={id}
                                                className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md"
                                            >
                                                {vendor.name}
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
                            onClick={() => {
                                setAttempted(true);
                                if (validate({ title, content, city, state })) mutation.mutate();
                            }}
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? "Posting..." : "Post"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
