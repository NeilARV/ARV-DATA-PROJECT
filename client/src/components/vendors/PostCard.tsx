import { User, MapPin, Image as ImageIcon } from "lucide-react";
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
                <span className="text-xs text-muted-foreground">{formatTimeAgo(post.createdAt)}</span>
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

            {/* Vendor tags */}
            {post.vendorTags.length > 0 && (
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {post.vendorTags.map((vendor) => (
                        <span key={vendor.id} className="text-xs text-primary">
                            {vendor.name}
                        </span>
                    ))}
                </div>
            )}

        </div>
    );
}
