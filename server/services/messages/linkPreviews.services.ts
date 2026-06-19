import { db } from 'server/storage';
import { eq, inArray } from 'drizzle-orm';
import { linkPreviews } from '@database/schemas/mastermind.schema';
import { fetchLinkMetadata } from 'server/lib/microlink';
import { isRealEstateUrl, buildRealEstatePreview } from 'server/lib/realEstatePreview';
import type { LinkPreviewWire } from '@shared/mastermind/events';

// Slack-style ceiling: a message with many links shows at most this many cards.
export const MAX_LINK_PREVIEWS_PER_MESSAGE = 2;

// Relies on content being sanitized first (sanitizeMessageHtml), which guarantees double-quoted
// href attributes — storing un-sanitized HTML anywhere would silently break preview extraction.
const ANCHOR_HREF_RE = /<a\b[^>]*\shref="([^"]*)"/gi;

type LinkPreviewRow = typeof linkPreviews.$inferSelect;

function toLinkPreviewWire(row: LinkPreviewRow): LinkPreviewWire {
    return {
        url: row.url,
        title: row.title,
        description: row.description,
        image: row.image,
        logo: row.logo,
        publisher: row.publisher,
    };
}

// Conservative normalization: lowercase host (URL does this), strip the #fragment, keep query
// params untouched. Non-http(s) schemes are rejected — only real web links get a preview.
export function normalizeUrl(raw: string): string | null {
    try {
        const u = new URL(raw.replace(/&amp;/g, '&').trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        u.hash = '';
        return u.toString();
    } catch {
        return null;
    }
}

// Pulls the (capped, de-duplicated, normalized) set of previewable URLs out of sanitized
// message HTML. Anchors are the only source — plain-text URLs that never became links are
// intentionally ignored.
export function extractPreviewUrls(html: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    ANCHOR_HREF_RE.lastIndex = 0;
    while ((match = ANCHOR_HREF_RE.exec(html)) !== null) {
        const normalized = normalizeUrl(match[1]);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        urls.push(normalized);
        if (urls.length >= MAX_LINK_PREVIEWS_PER_MESSAGE) break;
    }
    return urls;
}

// Batch lookup for hydration: returns only the URLs already in the cache, keyed by URL.
export async function getPreviewsForUrls(
    urls: string[],
): Promise<Map<string, LinkPreviewWire>> {
    if (urls.length === 0) return new Map();
    const rows = await db.select().from(linkPreviews).where(inArray(linkPreviews.url, urls));
    return new Map(rows.map((row) => [row.url, toLinkPreviewWire(row)]));
}

// Cache-first fetch. Checks the table before ever calling the API, so a request is spent only on
// a URL never seen before. `fetched` is true only when a live API call populated a new row, which
// is how callers decide whether a re-broadcast is warranted. Failures are not cached — a transient
// outage shouldn't poison a permanent cache.
async function getOrFetchPreview(url: string): Promise<{ fetched: boolean }> {
    const [existing] = await db
        .select({ id: linkPreviews.id })
        .from(linkPreviews)
        .where(eq(linkPreviews.url, url))
        .limit(1);
    if (existing) return { fetched: false };

    // Redfin/Zillow bot-block the metadata provider, so we build the card from the URL ourselves
    // and never call Microlink for those domains — even when the URL isn't a parseable listing
    // (buildRealEstatePreview returns null and the link simply gets no card).
    const meta = isRealEstateUrl(url)
        ? buildRealEstatePreview(url)
        : await fetchLinkMetadata(url);
    if (!meta) return { fetched: false };

    // ON CONFLICT guards the rare simultaneous-first-paste race: the UNIQUE(url) constraint keeps
    // a single row, and a loser simply no-ops rather than erroring.
    const inserted = await db
        .insert(linkPreviews)
        .values({ url, ...meta })
        .onConflictDoNothing({ target: linkPreviews.url })
        .returning({ id: linkPreviews.id });

    return { fetched: inserted.length > 0 };
}

// Ensures every given URL is cached, returning whether any URL required a live fetch (i.e. the
// message's previews changed and subscribers should be told).
export async function ensurePreviewsFetched(urls: string[]): Promise<boolean> {
    let fetchedAny = false;
    for (const url of urls) {
        const { fetched } = await getOrFetchPreview(url);
        if (fetched) fetchedAny = true;
    }
    return fetchedAny;
}
