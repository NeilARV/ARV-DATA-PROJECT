import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PostImage } from "@/types/vendors";

type ImageLightboxProps = {
    images: PostImage[];
    initialIndex: number;
    onClose: () => void;
};

export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
    const [index, setIndex] = useState(initialIndex);

    const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
    const next = () => setIndex((i) => (i + 1) % images.length);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") prev();
            if (e.key === "ArrowRight") next();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [images.length]);

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={onClose}
        >
            {/* Close */}
            <button
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                onClick={onClose}
            >
                <X className="w-5 h-5 text-white" />
            </button>

            {/* Image */}
            <div
                className="relative max-w-4xl max-h-[85vh] w-full mx-4 flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={images[index].imageUrl}
                    alt=""
                    className="max-w-full max-h-[85vh] rounded-lg object-contain shadow-2xl"
                />

                {images.length > 1 && (
                    <>
                        <button
                            onClick={prev}
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-white" />
                        </button>
                        <button
                            onClick={next}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-white" />
                        </button>

                        {/* Dots */}
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5">
                            {images.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setIndex(i)}
                                    className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/40"}`}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
