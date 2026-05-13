import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { EditorContent } from "@tiptap/react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPost, updatePost, uploadPostImage, deletePostImage } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";
import { usePostEditor } from "./usePostEditor";
import type { Post } from "@/types/vendors";

const FONT_SIZES = ["8", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28"];
const MAX_IMAGES = 5;

export type PostComposerHandle = {
    submit: () => void;
};

type PostComposerProps = {
    post?: Post;
    onSuccess?: () => void;
    hideSubmitButton?: boolean;
    onPendingChange?: (pending: boolean) => void;
};

export const PostComposer = forwardRef<PostComposerHandle, PostComposerProps>(
    function PostComposer({ post, onSuccess, hideSubmitButton = false, onPendingChange }: PostComposerProps, ref) {
        const isEditMode = !!post;
        const { toast } = useToast();
        const queryClient = useQueryClient();
        const fileInputRef = useRef<HTMLInputElement>(null);
        const [pendingFiles, setPendingFiles] = useState<File[]>([]);
        const [previews, setPreviews] = useState<string[]>([]);
        const [imagesToDelete, setImagesToDelete] = useState<number[]>([]);

        const { editor, editorState, dropdown } = usePostEditor(
            post ? { content: post.content, deps: [post.id] } : undefined
        );

        const existingImages = (post?.images ?? []).filter((img) => !imagesToDelete.includes(img.id));
        const totalImages = existingImages.length + pendingFiles.length;

        const mutation = useMutation({
            mutationFn: async () => {
                if (!editor) throw new Error("Editor not ready");
                const html = editor.getHTML();
                const plainText = editor.getText().trim();
                if (!plainText) throw new Error("Content is required");
                const title = plainText.slice(0, 100);

                const vendorIds: string[] = [];
                const categoryIds: number[] = [];
                editor.state.doc.descendants((node) => {
                    if (node.type.name === "vendorMention" && node.attrs.id) vendorIds.push(String(node.attrs.id));
                    if (node.type.name === "categoryMention" && node.attrs.id) categoryIds.push(Number(node.attrs.id));
                });

                if (isEditMode) {
                    await updatePost(post.id, { title, content: html, categoryIds, vendorIds });
                    await Promise.all([
                        ...imagesToDelete.map((id) => deletePostImage(post.id, id)),
                        ...pendingFiles.map((file) => uploadPostImage(post.id, file)),
                    ]);
                } else {
                    const newPost = await createPost({
                        title,
                        content: html,
                        categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
                        vendorIds: vendorIds.length > 0 ? vendorIds : undefined,
                    });
                    if (pendingFiles.length > 0) {
                        const results = await Promise.allSettled(
                            pendingFiles.map((file) => uploadPostImage(newPost.id, file))
                        );
                        const failed = results.filter((r) => r.status === "rejected");
                        if (failed.length > 0) {
                            throw new Error(`Post created but ${failed.length} image(s) failed to upload.`);
                        }
                    }
                }
            },
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ["posts"] });
                if (isEditMode) {
                    toast({ title: "Post updated", description: "Your post has been saved." });
                    onSuccess?.();
                } else {
                    toast({ title: "Posted!", description: "Your post has been shared." });
                    editor?.commands.clearContent();
                    previews.forEach((url) => URL.revokeObjectURL(url));
                    setPendingFiles([]);
                    setPreviews([]);
                }
            },
            onError: (err: unknown) => {
                toast({
                    title: "Error",
                    description: err instanceof Error ? err.message : isEditMode ? "Failed to update post." : "Failed to create post.",
                    variant: "destructive",
                });
            },
        });

        useImperativeHandle(ref, () => ({
            submit: () => mutation.mutate(),
        }));

        useEffect(() => {
            onPendingChange?.(mutation.isPending);
        }, [mutation.isPending, onPendingChange]);

        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            const slots = MAX_IMAGES - totalImages;
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

        const canSubmit = !mutation.isPending && (editorState?.hasContent ?? false);

        const toolbarBtn = (active: boolean) =>
            `p-1.5 rounded transition-colors ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`;

        const innerContent = (
            <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-colors">

                {/* Editor — clicking anywhere in the padded area focuses the editor */}
                <div
                    className={`px-3 pt-3 pb-1 ${isEditMode ? "min-h-[100px]" : "min-h-[72px]"} max-h-52 overflow-y-auto text-sm cursor-text`}
                    onClick={() => editor?.commands.focus()}
                >
                    <EditorContent editor={editor} />
                </div>

                {/* Image thumbnails */}
                {(existingImages.length > 0 || previews.length > 0) && (
                    <div className="flex flex-wrap gap-2 px-3 pb-2">
                        {existingImages.map((img) => (
                            <div key={img.id} className="relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0">
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
                            <div key={`new-${i}`} className="relative w-14 h-14 rounded-md overflow-hidden flex-shrink-0">
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

                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-2 pb-2 pt-1 border-t border-border/50">
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
                        className={toolbarBtn(editorState?.isBold ?? false)}
                        title="Bold"
                    >
                        <span className="text-xs font-bold leading-none">B</span>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
                        className={toolbarBtn(editorState?.isItalic ?? false)}
                        title="Italic"
                    >
                        <span className="text-xs italic leading-none">I</span>
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run(); }}
                        className={toolbarBtn(editorState?.isUnderline ?? false)}
                        title="Underline"
                    >
                        <span className="text-xs underline leading-none">U</span>
                    </button>

                    <div className="w-px h-3.5 bg-border mx-1 flex-shrink-0" />

                    <select
                        className="font-size-select text-xs text-foreground bg-background border-0 cursor-pointer focus:outline-none py-1 pl-1 pr-0 rounded"
                        value={editorState?.fontSize ?? "14"}
                        onChange={(e) => {
                            if (e.target.value === "14") {
                                editor?.chain().focus().unsetFontSize().run();
                            } else {
                                editor?.chain().focus().setFontSize(`${e.target.value}px`).run();
                            }
                        }}
                        title="Font size"
                    >
                        {FONT_SIZES.map((s) => (
                            <option key={s} value={s}>{s}px</option>
                        ))}
                    </select>

                    <div className="flex-1" />

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
                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                title="Attach images (jpeg, png)"
                            >
                                <ImagePlus className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}

                    {!hideSubmitButton && (
                        <Button
                            size="sm"
                            onClick={() => mutation.mutate()}
                            disabled={!canSubmit}
                            className="h-7 text-xs px-3 ml-1.5"
                        >
                            {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Post"}
                        </Button>
                    )}
                </div>
            </div>
        );

        const dropdownPortal = dropdown && dropdown.items.length > 0 && createPortal(
            <div
                className="fixed z-[99999] bg-background border border-border rounded-lg shadow-lg overflow-hidden py-1"
                    data-mention-dropdown="true"
                style={{
                    bottom: window.innerHeight - dropdown.rect.top + 6,
                    left: Math.max(8, Math.min(dropdown.rect.left, window.innerWidth - 252)),
                    minWidth: 200,
                    maxWidth: 280,
                }}
            >
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
                    {dropdown.type === "vendor" ? "Tag a vendor" : "Tag a category"}
                </div>
                {dropdown.items.map((item, i) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                            i === dropdown.selectedIndex ? "bg-accent" : "hover:bg-accent"
                        }`}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            dropdown.command(item);
                        }}
                    >
                        <span className={`text-xs font-semibold ${dropdown.type === "vendor" ? "text-primary" : "text-muted-foreground"}`}>
                            {dropdown.type === "vendor" ? "@" : "#"}
                        </span>
                        {item.label}
                    </button>
                ))}
            </div>,
            document.body,
        );

        if (isEditMode) {
            return (
                <>
                    {innerContent}
                    {dropdownPortal}
                </>
            );
        }

        return (
            <div className="flex-shrink-0 border-t border-border bg-background">
                <div className="m-3">
                    {innerContent}
                </div>
                {dropdownPortal}
            </div>
        );
    }
);
