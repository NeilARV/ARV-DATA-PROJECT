import { useQuery } from "@tanstack/react-query";
import { PostCard } from "./PostCard";
import { PostComposer } from "./PostComposer";
import { fetchPosts } from "@/api/vendors.api";
import type { PostFilters } from "@/hooks/useVendorNav";

type ActivityFeedProps = {
    postFilters: PostFilters;
};

export function ActivityFeed({ postFilters }: ActivityFeedProps) {
    const { data: posts, isLoading } = useQuery({
        queryKey: ["posts", postFilters],
        queryFn: () => fetchPosts(postFilters),
        staleTime: 60 * 1000,
    });

    const filterLabel = postFilters.vendorId
        ? "Filtered by vendor"
        : postFilters.categoryId
        ? "Filtered by category"
        : null;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <div className="h-7 flex items-center">
                    <h2 className="font-semibold text-lg text-foreground">Activity Feed</h2>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {filterLabel ?? "See recent project activity"}
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />
                    ))
                ) : (
                    posts!.map((post) => <PostCard key={post.id} post={post} />)
                )}
            </div>

            <PostComposer />
        </div>
    );
}
