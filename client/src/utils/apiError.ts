/**
 * Extracts a human-readable message from an `apiRequest` error, which is thrown as
 * `${status}: ${body}` where the body is usually a JSON `{ message }`.
 */
export function parseApiError(error: unknown, fallback = 'Something went wrong'): string {
    if (!(error instanceof Error) || !error.message) return fallback;
    const match = error.message.match(/^\d+:\s*([\s\S]+)$/);
    const body = match ? match[1] : error.message;
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.message === 'string') return parsed.message;
    } catch {
        /* body was not JSON — use it as-is */
    }
    return body || fallback;
}
