import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { fetchPosts } from '@/api/vendors.api';
import type { PostFilters } from '@/hooks/useNav';
import { useAuth } from '@/hooks/use-auth';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ActivityFeedProps = {
    postFilters: PostFilters;
};

export function ActivityFeed({ postFilters }: ActivityFeedProps) {
    const { isAuthenticated } = useAuth();
    const [, setLocation] = useLocation();

    const { data: posts, isLoading } = useQuery({
        queryKey: ['posts', postFilters],
        queryFn: () => fetchPosts(postFilters),
        staleTime: 60 * 1000,
        enabled: isAuthenticated,
    });

    const filterLabel = postFilters.vendorId
        ? 'Filtered by vendor'
        : postFilters.categoryId
          ? 'Filtered by category'
          : null;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <div className="h-7 flex items-center">
                    <h2 className="font-semibold text-xl text-foreground">Activity Feed</h2>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {filterLabel ?? 'See recent project activity'}
                </p>
            </div>

            {!isAuthenticated ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                    <LogIn className="w-8 h-8 text-muted-foreground" />
                    <div className="space-y-1">
                        <p className="font-medium text-foreground">Please log in to view posts</p>
                        <p className="text-sm text-muted-foreground">
                            Sign in or create an account to see activity from vendors.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation('/login?redirect=%2Fvendors')}
                        >
                            Log In
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setLocation('/signup?redirect=%2Fvendors')}
                        >
                            Sign Up
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
                        {isLoading
                            ? Array.from({ length: 3 }).map((_, i) => (
                                  <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />
                              ))
                            : posts!.map((post) => <PostCard key={post.id} post={post} />)}
                    </div>
                    <PostComposer />
                </>
            )}
        </div>
    );
}
