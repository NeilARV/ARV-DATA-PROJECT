/** True when the user prefers reduced motion — animations should be skipped. */
export function prefersReducedMotion() {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
}
