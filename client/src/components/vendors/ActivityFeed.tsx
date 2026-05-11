import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { PostCard } from "./PostCard";
import { CreatePostDialog } from "./CreatePostDialog";
import { fetchPosts } from "@/api/vendors.api";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { PostFilters } from "@/hooks/useVendorNav";

type ActivityFeedProps = {
    postFilters: PostFilters;
};

export function ActivityFeed({ postFilters }: ActivityFeedProps) {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const { isAuthenticated } = useAuth();
    const { toast } = useToast();

    const { data: posts, isLoading } = useQuery({
        queryKey: ["posts", postFilters],
        queryFn: () => fetchPosts(postFilters),
        staleTime: 60 * 1000,
    });

    const handleNewPost = () => {
        if (!isAuthenticated) {
            toast({
                title: "Sign in to post",
                description: "You must be signed in to share a post.",
            });
            return;
        }
        setShowCreateDialog(true);
    };

    const filterLabel = postFilters.vendorId
        ? "Filtered by vendor"
        : postFilters.categoryId
        ? "Filtered by category"
        : null;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-foreground">Activity Feed</h2>
                    <Button size="sm" onClick={handleNewPost} className="h-7 gap-1 text-xs">
                        <Plus className="w-3.5 h-3.5" />
                        New Post
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 h-4">
                    {filterLabel ?? ""}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />
                    ))
                ) : !posts || posts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                        <p className="text-sm text-muted-foreground">No posts yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Be the first to share a project update.
                        </p>
                    </div>
                ) : (
                    posts.map((post) => <PostCard key={post.id} post={post} />)
                )}
            </div>

            <CreatePostDialog
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
            />
        </div>
    );
}
