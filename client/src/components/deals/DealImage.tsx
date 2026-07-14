import { useEffect, useState } from 'react';
import { Home, Loader2 } from 'lucide-react';
import { cn } from '@/utils/merge';

type DealImageProps = {
    /** Relative street-view URL from the API, or null when the deal has no resolvable image. */
    src: string | null | undefined;
    alt: string;
    className?: string;
    /** Size of the fallback house glyph shown while there is no image. */
    iconClassName?: string;
};

/**
 * A deal's street-view image with a neutral house-glyph fallback. Preloads the source so the
 * placeholder holds until the pixels are ready (no pop-in), and falls back cleanly on error —
 * shared by the compact list-row thumbnail and the large detail hero.
 */
export default function DealImage({ src, alt, className, iconClassName }: DealImageProps) {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'empty'>(src ? 'loading' : 'empty');
    const [resolvedSrc, setResolvedSrc] = useState('');

    useEffect(() => {
        if (!src) {
            setStatus('empty');
            return;
        }
        setStatus('loading');
        let active = true;
        const img = new Image();
        img.onload = () => {
            if (!active) return;
            setResolvedSrc(src);
            setStatus('loaded');
        };
        img.onerror = () => active && setStatus('empty');
        img.src = src;
        return () => {
            active = false;
        };
    }, [src]);

    return (
        <div className={cn('relative overflow-hidden bg-muted', className)}>
            {status === 'loading' && (
                <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin text-muted-foreground/40" />
            )}
            {status === 'loaded' && (
                <img
                    src={resolvedSrc}
                    alt={alt}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
            {status === 'empty' && (
                <Home
                    className={cn(
                        'absolute inset-0 m-auto text-muted-foreground/25',
                        iconClassName ?? 'h-8 w-8',
                    )}
                    strokeWidth={1.5}
                />
            )}
        </div>
    );
}
