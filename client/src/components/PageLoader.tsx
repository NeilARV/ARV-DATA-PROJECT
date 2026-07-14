import { Loader2 } from 'lucide-react';

import { cn } from '@/utils/merge';

type PageLoaderProps = {
    /** Overrides the default full-viewport-height centering wrapper (e.g. `h-dvh`, `h-screen`). */
    className?: string;
};

/** Full-height centered loading spinner for gated or async page shells. */
export function PageLoader({ className = 'min-h-screen' }: PageLoaderProps) {
    return (
        <div className={cn('flex items-center justify-center', className)}>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
}
