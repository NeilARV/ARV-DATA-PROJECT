import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchPosts } from "@/api/vendors.api";
import { ImageLightbox } from "./ImageLightbox";
import type { PostImage } from "@/types/vendors";

type VendorPhotoGalleryProps = {
    vendorId: string;
};

export function VendorPhotoGallery({ vendorId }: VendorPhotoGalleryProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const { data: posts, isLoading } = useQuery({
        queryKey: ["posts", { vendorId }],
        queryFn: () => fetchPosts({ vendorId }),
        staleTime: 5 * 60 * 1000,
    });

    const images: PostImage[] = (posts ?? []).flatMap((p) => p.images);

    const scroll = (dir: 1 | -1) => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
    };

    return (
        <div className="px-6 pb-6 border-t border-border pt-5">
            <h3 className="text-base font-semibold text-foreground mb-3">
                Photo Gallery{!isLoading && images.length > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">({images.length})</span>
                )}
            </h3>

            {isLoading ? (
                <div className="flex overflow-hidden">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-full lg:w-1/2 xl:w-1/2 2xl:w-1/3 pr-2 last:pr-0"
                        >
                            <div className="aspect-video bg-muted rounded-lg animate-pulse" />
                        </div>
                    ))}
                </div>
            ) : images.length === 0 ? (
                <p className="text-sm text-muted-foreground">No images to display.</p>
            ) : (
                <div className="relative group">
                    <div
                        ref={containerRef}
                        className="flex overflow-x-hidden snap-x snap-mandatory"
                    >
                        {images.map((img, i) => (
                            <div
                                key={img.id}
                                className="flex-shrink-0 w-full lg:w-1/2 xl:w-1/2 2xl:w-1/3 pr-2 last:pr-0 snap-start"
                            >
                                <div
                                    className="aspect-video rounded-lg overflow-hidden cursor-pointer bg-muted"
                                    onClick={() => setLightboxIndex(i)}
                                >
                                    <img
                                        src={img.imageUrl}
                                        alt=""
                                        className="w-full h-full object-cover object-center hover:opacity-90 transition-opacity"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {images.length > 1 && (
                        <>
                            <button
                                onClick={() => scroll(-1)}
                                className="absolute -left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <ChevronLeft className="w-4 h-4 text-foreground" />
                            </button>
                            <button
                                onClick={() => scroll(1)}
                                className="absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <ChevronRight className="w-4 h-4 text-foreground" />
                            </button>
                        </>
                    )}
                </div>
            )}

            {lightboxIndex !== null && (
                <ImageLightbox
                    images={images}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    );
}
