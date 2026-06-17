// Microlink metadata API integration. Microlink fetches the target URL on its own
// infrastructure and returns structured metadata, so the SSRF surface of fetching arbitrary
// user-supplied URLs stays off our server. This module is the only place the provider is named —
// swapping providers means changing this file alone.

const MICROLINK_ENDPOINT = 'https://api.microlink.io';
const FETCH_TIMEOUT_MS = 10_000;

// Stored metadata is capped so a pathological page can't bloat the cache row.
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 1000;
const MAX_PUBLISHER = 200;

export interface LinkMetadata {
    title: string | null;
    description: string | null;
    image: string | null;
    logo: string | null;
    publisher: string | null;
}

interface MicrolinkResponse {
    status?: string;
    data?: {
        title?: unknown;
        description?: unknown;
        publisher?: unknown;
        image?: { url?: unknown } | null;
        logo?: { url?: unknown } | null;
    };
}

function asString(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

// Image/logo URLs come from the target page's attacker-controllable og:image/favicon, so reject
// anything that isn't an http(s) URL before it can be stored and rendered as an <img src>.
function asUrl(value: { url?: unknown } | null | undefined): string | null {
    if (!value || typeof value.url !== 'string') return null;
    return /^https?:\/\//i.test(value.url) ? value.url : null;
}

// Fetches metadata for a URL. Returns null on any failure (network, timeout, non-success status,
// or a page with nothing worth showing) so callers can fail soft without caching a dud.
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
    const endpoint = `${MICROLINK_ENDPOINT}?url=${encodeURIComponent(url)}`;
    const apiKey = process.env.MICROLINK_API_KEY;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(endpoint, {
            signal: controller.signal,
            headers: apiKey ? { 'x-api-key': apiKey } : undefined,
        });
        if (!res.ok) return null;

        const body = (await res.json()) as MicrolinkResponse;
        if (body.status !== 'success' || !body.data) return null;

        const meta: LinkMetadata = {
            title: asString(body.data.title, MAX_TITLE),
            description: asString(body.data.description, MAX_DESCRIPTION),
            image: asUrl(body.data.image),
            logo: asUrl(body.data.logo),
            publisher: asString(body.data.publisher, MAX_PUBLISHER),
        };

        if (!meta.title && !meta.description && !meta.image) return null;
        return meta;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
