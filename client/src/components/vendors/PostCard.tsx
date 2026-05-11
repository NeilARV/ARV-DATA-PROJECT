import { useState, useRef, useEffect } from "react";
import { User, MapPin, Image as ImageIcon, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePost } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";
import { EditPostDialog } from "./EditPostDialog";
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
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isOwner = !!user && user.id === post.userId;

    const [showMenu, setShowMenu] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
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
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
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
                        {isOwner && (
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={() => setShowMenu((v) => !v)}
                                    className="p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground ml-1"
                                >
                                    <MoreVertical className="w-3.5 h-3.5" />
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

                {/* Title + category tags */}
                <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground leading-snug">{post.title}</h3>
                        {post.categories.length > 0 && (
                            <>
                                <span className="text-border text-xs">|</span>
                                <div className="flex flex-wrap gap-1">
                                    {post.categories.map((cat) => (
                                        <Badge key={cat.id} variant="secondary" className="text-xs px-1.5 py-0">
                                            {cat.name}
                                        </Badge>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{post.content}</p>
                </div>

                {/* Image placeholder */}
                <div className="w-full h-28 bg-muted rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                </div>

                {/* Vendor tags (plain text, below image) */}
                {post.vendorTags.length > 0 && (
                    <div className="flex flex-wrap gap-y-1">
                        {post.vendorTags.map((vendor, i) => (
                            <span key={vendor.id} className="flex items-center text-xs text-primary">
                                {i > 0 && <span className="mx-2 text-muted-foreground">|</span>}
                                {vendor.name}
                            </span>
                        ))}
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
                hideOverlay
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
        </>
    );
}
