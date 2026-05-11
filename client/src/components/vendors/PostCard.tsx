import { Heart, MessageCircle, MapPin, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

    return (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {/* Image placeholder */}
            <div className="w-full h-28 bg-muted rounded-lg flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
            </div>

            <div>
                <h3 className="font-semibold text-sm text-foreground leading-snug mb-1">{post.title}</h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                    <span>{post.authorFirstName} {post.authorLastName}</span>
                    <span>·</span>
                    <span>{formatTimeAgo(post.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {post.content}
                </p>
            </div>

            {location && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span>{location}</span>
                </div>
            )}

            {post.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {post.categories.map((cat) => (
                        <Badge key={cat.id} variant="secondary" className="text-xs px-1.5 py-0">
                            {cat.name}
                        </Badge>
                    ))}
                </div>
            )}

            {post.vendorTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {post.vendorTags.map((vendor) => (
                        <Badge
                            key={vendor.id}
                            variant="outline"
                            className="text-xs px-1.5 py-0 text-primary border-primary/40"
                        >
                            {vendor.name}
                        </Badge>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-3 pt-1 border-t border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="w-3.5 h-3.5" />
                    <span>{post.likeCount}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{post.commentCount}</span>
                </div>
            </div>
        </div>
    );
}
