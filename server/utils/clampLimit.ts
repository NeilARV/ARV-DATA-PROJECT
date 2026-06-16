// Normalizes a client-supplied page-size into a safe range: a non-positive, missing, or
// unparseable value falls back to `fallback`; the result is then capped at `max`.
export function clampLimit(
    raw: number | string | null | undefined,
    { fallback, max }: { fallback: number; max: number },
): number {
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    const value = parsed != null && !Number.isNaN(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(max, value);
}
