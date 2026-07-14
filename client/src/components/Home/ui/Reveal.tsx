import { useEffect, useRef, useState } from 'react';

import { prefersReducedMotion } from '@/utils/motion';

/** Reveals (fade + slide up) its children the first time they scroll into view. */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        // Reduced motion, or an environment without IntersectionObserver (older browsers, some
        // crawlers/headless renderers): show immediately. The content must never stay gated at
        // opacity-0 behind an observer that will never fire, or the section ships blank.
        if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
            setShown(true);
            return;
        }
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setShown(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.15 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${
                shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            } ${className ?? ''}`}
        >
            {children}
        </div>
    );
}
