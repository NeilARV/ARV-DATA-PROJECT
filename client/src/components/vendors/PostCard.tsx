import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { User, MapPin, MoreVertical, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePost } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { EditPostDialog } from "./EditPostDialog";
import { ImageLightbox } from "./ImageLightbox";
import type { Post } from "@/types/vendors";

function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type PostCardProps = {
    post: Post;
};

export function PostCard({ post }: PostCardProps) {
    const location = [post.city, post.state].filter(Boolean).join(", ");
    const [, setLocation] = useLocation();
    const { user, isAdmin, isOwner: isPrivilegedRole } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isPostAuthor = !!user && user.id === post.userId;
    const canModify = isPostAuthor || isAdmin || isPrivilegedRole;

    const [showMenu, setShowMenu] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [imageIndex, setImageIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showMenu]);

    const deleteMutation = useMutation({
        mutationFn: () => deletePost(post.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
            toast({ title: "Post deleted" });
            setShowDeleteDialog(false);
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete post.", variant: "destructive" });
        },
    });

    return (
        <>
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">

                {/* Author row */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {post.authorProfileImageUrl ? (
                                <img
                                    src={post.authorProfileImageUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <User className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground leading-snug">
                                {post.authorFirstName} {post.authorLastName}
                            </span>
                            {location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    <span>{location}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">{formatTimeAgo(post.createdAt)}</span>
                        {canModify && (
                            <div className="relative inline-flex items-center" ref={menuRef}>
                                <button
                                    onClick={() => setShowMenu((v) => !v)}
                                    className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground ml-1"
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                                {showMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-36 bg-background border border-border rounded-md shadow-lg z-10">
                                        <button
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                                            onClick={() => { setShowEditDialog(true); setShowMenu(false); }}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit Post
                                        </button>
                                        <button
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted text-destructive flex items-center gap-2"
                                            onClick={() => { setShowDeleteDialog(true); setShowMenu(false); }}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Delete Post
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Formatted content */}
                <div
                    className="text-sm text-foreground leading-relaxed post-content"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                    onClick={(e) => {
                        const mention = (e.target as HTMLElement).closest<HTMLElement>("[data-type]");
                        if (!mention) return;
                        const id = mention.dataset.id;
                        if (!id) return;
                        e.stopPropagation();
                        if (mention.dataset.type === "vendorMention") {
                            setLocation(`/vendors?vendor=${id}`);
                        } else if (mention.dataset.type === "categoryMention") {
                            setLocation(`/vendors?category=${id}`);
                        }
                    }}
                />

                {/* Images */}
                {post.images.length > 0 && (
                    <div
                        className="relative w-full h-56 rounded-lg overflow-hidden bg-muted cursor-pointer"
                        onClick={() => setLightboxOpen(true)}
                    >
                        <img
                            src={post.images[imageIndex].imageUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-70 pointer-events-none"
                            aria-hidden="true"
                        />
                        <img
                            src={post.images[imageIndex].imageUrl}
                            alt=""
                            className="relative w-full h-full object-contain"
                        />
                        {post.images.length > 1 && (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i - 1 + post.images.length) % post.images.length); }}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4 text-white" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setImageIndex((i) => (i + 1) % post.images.length); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                                >
                                    <ChevronRight className="w-4 h-4 text-white" />
                                </button>
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                    {post.images.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={(e) => { e.stopPropagation(); setImageIndex(i); }}
                                            className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imageIndex ? "bg-white" : "bg-white/50"}`}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

            </div>

            {/* Edit dialog */}
            <EditPostDialog
                open={showEditDialog}
                onClose={() => setShowEditDialog(false)}
                post={post}
            />

            {/* Delete confirmation */}
            <AppDialog
                open={showDeleteDialog}
                onClose={() => setShowDeleteDialog(false)}
            >
                <ConfirmationContent
                    title="Delete Post"
                    description="Are you sure you want to delete this post? This cannot be undone."
                    confirmText="Delete"
                    cancelText="Cancel"
                    variant="destructive"
                    isLoading={deleteMutation.isPending}
                    onClose={() => setShowDeleteDialog(false)}
                    onConfirm={() => deleteMutation.mutate()}
                />
            </AppDialog>

            {/* Image lightbox */}
            {lightboxOpen && post.images.length > 0 && (
                <ImageLightbox
                    images={post.images}
                    initialIndex={imageIndex}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </>
    );
}
