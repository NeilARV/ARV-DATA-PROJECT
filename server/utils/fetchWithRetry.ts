import { delay } from "./delay";

export async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retryAttempts: number,
    delayMs: number,
    options: { maxAttempts?: number; retryDelayMs?: number; label?: string } = {}
): Promise<Response> {
    const {
        maxAttempts = retryAttempts,
        retryDelayMs = delayMs,
        label = "API",
    } = options;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, init);
            if (response.ok) return response;
            lastError = new Error(`${label} returned ${response.status}`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
        if (attempt < maxAttempts) {
            console.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${retryDelayMs}ms...`);
            await delay(retryDelayMs);
        }
    }
    throw lastError ?? new Error(`${label} failed after ${maxAttempts} attempts`);
}