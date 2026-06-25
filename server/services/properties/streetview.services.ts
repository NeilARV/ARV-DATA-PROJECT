import crypto from 'crypto';
import { db } from 'server/storage';
import { streetviewCache } from '@database/schemas/properties.schema';
import { eq, sql, and } from 'drizzle-orm';
import { getSupabase, streetviewStorageBucket } from 'server/lib/supabase';

interface StreetviewImageResult {
    available: true;
    // Supabase CDN URL when the image lives in Storage (the common path). The controller
    // redirects here so image bytes never stream through the API/Neon.
    publicUrl: string | null;
    // Legacy bytes — only set for rows cached before the Storage migration, or when Storage
    // is unavailable. The controller streams these as a fallback.
    imageData: Buffer | null;
    contentType: string;
    cached: boolean;
    imageSource: 'streetview' | 'satellite';
}

interface StreetviewErrorResult {
    available: false;
    message: string;
    status: string;
    reason?: string;
    cached: boolean;
}

type StreetviewResult = StreetviewImageResult | StreetviewErrorResult;

interface StreetviewParams {
    address: string;
    city?: string;
    state?: string;
    size?: string;
    sfrPropertyId?: number;
}

// Cache expiry durations in days
const EXPIRY_DAYS = {
    streetview: 29, // Google TOS requires < 30 days
    satellite: 15, // Shorter so we retry Street View sooner
    noImage: 7, // Re-check periodically for new Street View coverage
} as const;

/**
 * Gets a Street View image for the given address, falling back to satellite if unavailable.
 * Order: cache → Street View API → Satellite API → no image.
 * Successful images are stored in Supabase Storage; the result then carries a `publicUrl` the
 * controller redirects to, so the image bytes never stream through the API on cache hits.
 * @param params - Streetview parameters (address, city, state, size, propertyId)
 * @returns StreetviewResult with a public URL / image data, or an unavailable result
 */
export async function getStreetviewImage(params: StreetviewParams): Promise<StreetviewResult> {
    const { address, city = '', state = '', size = '600x400', sfrPropertyId } = params;

    const normalizedAddress = address.trim();
    const normalizedCity = city.trim();
    const normalizedState = state.trim();
    const normalizedSize = size.trim();

    // Step 1: Check cache — returns any cached result (streetview, satellite, or failure)
    const cachedResult = await checkCache(
        normalizedAddress,
        normalizedCity,
        normalizedState,
        normalizedSize,
        sfrPropertyId,
    );

    if (cachedResult) {
        return cachedResult;
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_API_KEY not configured');
        throw new Error('Street View service not configured');
    }

    // Combine address components for the location parameter
    const locationParts = [normalizedAddress];
    if (normalizedCity) locationParts.push(normalizedCity);
    if (normalizedState) locationParts.push(normalizedState);
    const location = locationParts.join(', ');

    // Step 2: Check Street View metadata API (free — avoids charges for unavailable images)
    console.log(
        `[STREETVIEW CACHE MISS] Checking metadata for: ${normalizedAddress}, ${normalizedCity}, ${normalizedState}`,
    );
    const metadata = await checkMetadata(location, apiKey);

    if (metadata.status === 'OK') {
        console.log(`[STREETVIEW] Fetching image from Google API for: ${location}`);
        const imageResult = await fetchStreetviewImage(location, normalizedSize, apiKey);

        if (imageResult) {
            const { publicUrl } = await cacheImage(
                normalizedAddress,
                normalizedCity,
                normalizedState,
                normalizedSize,
                sfrPropertyId,
                imageResult.buffer,
                imageResult.contentType,
                'streetview',
            );
            return {
                available: true,
                publicUrl,
                imageData: publicUrl ? null : imageResult.buffer,
                contentType: imageResult.contentType,
                cached: false,
                imageSource: 'streetview',
            };
        }
    }

    // Step 3: Street View not available — try satellite fallback
    console.log(
        `[STREETVIEW] Street View unavailable (status: ${metadata.status}), trying satellite for: ${location}`,
    );
    const satelliteResult = await fetchSatelliteImage(location, normalizedSize, apiKey);

    if (satelliteResult) {
        const { publicUrl } = await cacheImage(
            normalizedAddress,
            normalizedCity,
            normalizedState,
            normalizedSize,
            sfrPropertyId,
            satelliteResult.buffer,
            satelliteResult.contentType,
            'satellite',
        );
        return {
            available: true,
            publicUrl,
            imageData: publicUrl ? null : satelliteResult.buffer,
            contentType: satelliteResult.contentType,
            cached: false,
            imageSource: 'satellite',
        };
    }

    // Step 4: Neither source returned an image — cache the failure
    await cacheNegativeResult(
        normalizedAddress,
        normalizedCity,
        normalizedState,
        normalizedSize,
        sfrPropertyId,
        metadata.status,
    );

    return {
        available: false,
        message: 'Street View image not available',
        status: metadata.status,
        reason:
            metadata.status === 'ZERO_RESULTS'
                ? 'No panorama found near this location'
                : metadata.status === 'NOT_FOUND'
                  ? 'Address not found'
                  : 'Street View not available for this location',
        cached: false,
    };
}

// ─── Supabase Storage helpers ──────────────────────────────────────────────────

// Cap per Supabase Storage .remove() call so a large cleanup batch stays under the API's
// object limit instead of failing (and orphaning) the whole set at once.
const STORAGE_REMOVE_BATCH_SIZE = 100;

/**
 * Best-effort removal of stored Street View images from Supabase Storage. Called by the cache
 * cleanup job before it deletes the rows. Failures are logged, never thrown — the DB delete is
 * the source of truth and still proceeds; an unremovable object is logged so it can be reconciled.
 * @param paths storage paths (from `streetview_cache.storage_path`); null/empty entries are ignored
 */
export async function removeStoredStreetviewImages(paths: Array<string | null>): Promise<void> {
    const valid = paths.filter((p): p is string => !!p);
    if (valid.length === 0) return;

    for (let i = 0; i < valid.length; i += STORAGE_REMOVE_BATCH_SIZE) {
        const batch = valid.slice(i, i + STORAGE_REMOVE_BATCH_SIZE);
        try {
            const { error } = await getSupabase()
                .storage.from(streetviewStorageBucket)
                .remove(batch);
            if (error) {
                console.error('[STREETVIEW STORAGE] Failed to remove objects:', error.message);
            }
        } catch (err) {
            console.error('[STREETVIEW STORAGE] Failed to remove objects:', err);
        }
    }
}

/** File extension for a stored image, derived from its content type. */
function imageExtension(contentType: string): string {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    return 'jpg';
}

/**
 * Stable, content-addressed storage key for an image. Same address+size always maps to the
 * same object, so re-fetches overwrite in place rather than orphaning old files.
 */
function storageKey(parts: {
    address: string;
    city: string;
    state: string;
    size: string;
    ext: string;
}): string {
    const { address, city, state, size, ext } = parts;
    const hash = crypto
        .createHash('sha1')
        .update(`${address}|${city}|${state}|${size}`.toLowerCase())
        .digest('hex');
    return `streetview/${hash}.${ext}`;
}

/**
 * Public CDN URL for a stored object. Built from SUPABASE_URL directly (not the SDK) so a
 * cache-hit read never constructs a Supabase client. Returns null if SUPABASE_URL is unset.
 */
function publicUrlForPath(path: string): string | null {
    const base = process.env.SUPABASE_URL;
    if (!base) return null;
    return `${base}/storage/v1/object/public/${streetviewStorageBucket}/${path}`;
}

/**
 * Uploads image bytes to the Supabase Street View bucket and returns the public URL.
 * Best-effort: returns null (and the caller falls back to bytea) if Storage is unconfigured
 * or the upload fails, so the feature still works without Supabase.
 */
async function uploadToStorage(
    path: string,
    buffer: Buffer,
    contentType: string,
): Promise<string | null> {
    try {
        const { error } = await getSupabase()
            .storage.from(streetviewStorageBucket)
            .upload(path, buffer, { contentType, upsert: true });
        if (error) {
            console.error('[STREETVIEW STORAGE] Upload failed:', error.message);
            return null;
        }
        return publicUrlForPath(path);
    } catch (err) {
        console.error('[STREETVIEW STORAGE] Upload error:', err);
        return null;
    }
}

/**
 * Lazily moves a legacy bytea row into Supabase Storage: uploads the bytes, then records the
 * path and clears the bytea so future hits skip the bytea read. Best-effort.
 * Side effect: updates the streetview_cache row.
 * @returns the public CDN URL, or null if there were no bytes or Storage was unavailable
 */
async function migrateRowToStorage(
    cached: typeof streetviewCache.$inferSelect,
    contentType: string,
): Promise<string | null> {
    if (!cached.imageData) return null;

    const ext = imageExtension(contentType);
    const path = storageKey({
        address: cached.address,
        city: cached.city,
        state: cached.state,
        size: cached.size,
        ext,
    });
    const publicUrl = await uploadToStorage(path, cached.imageData, contentType);
    if (!publicUrl) return null;

    await db
        .update(streetviewCache)
        .set({ storagePath: path, imageData: null })
        .where(eq(streetviewCache.id, cached.id))
        .catch((e) => console.error('[STREETVIEW STORAGE] Migrate update failed:', e));
    console.log(
        `[STREETVIEW CACHE HIT] Migrated legacy image to Storage for: ${cached.address}, ${cached.city}, ${cached.state}`,
    );
    return publicUrl;
}

/**
 * Resolves a raw cache row to a StreetviewResult.
 *
 * Prefers the Supabase CDN URL (no bytea read). A legacy row that still holds only bytea is
 * migrated to Storage via {@link migrateRowToStorage} (a write on the read path); if Storage is
 * unavailable, the bytea is returned so the image still renders.
 */
async function buildCacheResult(
    cached: typeof streetviewCache.$inferSelect,
): Promise<StreetviewResult> {
    const { address, city, state } = cached;

    if (cached.metadataStatus !== 'OK' || (!cached.imageData && !cached.storagePath)) {
        console.log(
            `[STREETVIEW CACHE HIT] Cached negative result (status: ${cached.metadataStatus || 'no image'}) for: ${address}, ${city}, ${state}`,
        );
        return {
            available: false,
            message: 'Street View image not available',
            status: cached.metadataStatus || 'NOT_AVAILABLE',
            cached: true,
        };
    }

    const source: 'streetview' | 'satellite' =
        cached.imageSource === 'satellite' ? 'satellite' : 'streetview';
    const contentType = cached.contentType || 'image/jpeg';

    // Preferred path: image already in Storage — return its CDN URL, no bytea read.
    if (cached.storagePath) {
        const publicUrl = publicUrlForPath(cached.storagePath);
        if (publicUrl) {
            console.log(
                `[STREETVIEW CACHE HIT] Using stored ${source} image for: ${address}, ${city}, ${state}`,
            );
            return {
                available: true,
                publicUrl,
                imageData: null,
                contentType,
                cached: true,
                imageSource: source,
            };
        }
    }

    // Legacy row with only bytea — migrate to Storage, falling back to the bytea if that fails.
    if (cached.imageData) {
        const publicUrl = await migrateRowToStorage(cached, contentType);
        return {
            available: true,
            publicUrl,
            imageData: publicUrl ? null : cached.imageData,
            contentType,
            cached: true,
            imageSource: source,
        };
    }

    // storagePath set but no SUPABASE_URL to build a URL, and no bytea — treat as unavailable.
    return {
        available: false,
        message: 'Street View image not available',
        status: 'NOT_AVAILABLE',
        cached: true,
    };
}

/**
 * Checks the cache for a streetview or satellite image.
 *
 * Lookup order:
 * 1. By sfrPropertyId (fast indexed lookup — finds entries cached with an explicit ID)
 * 2. By address + city + state + exact size (catches entries cached without sfrPropertyId, e.g. from grid view)
 * 3. By address + city + state, any size (allows modal/panel to reuse card-sized cache entries)
 *
 * Keeping sfrPropertyId out of the address-based conditions is intentional: grid view properties
 * don't carry sfrPropertyId, so their cache entries are stored with sfr_property_id = NULL.
 * If we required sfrPropertyId to match in the address lookup, detail views (which do have an ID)
 * would always miss those entries and then fail when no API key is configured.
 */
async function checkCache(
    address: string,
    city: string,
    state: string,
    size: string,
    sfrPropertyId?: number,
): Promise<StreetviewResult | null> {
    // Fast path: try by sfrPropertyId for entries that were cached with one.
    if (sfrPropertyId != null) {
        const byId = await db
            .select()
            .from(streetviewCache)
            .where(
                and(
                    eq(streetviewCache.sfrPropertyId, sfrPropertyId),
                    sql`${streetviewCache.expiresAt} > NOW()`,
                ),
            )
            .limit(1);

        if (byId.length > 0) return buildCacheResult(byId[0]);
    }

    // Address-based lookup — finds entries regardless of whether sfrPropertyId was stored.
    // Try exact size first, then fall back to any size so modal (800x450) reuses card (400x300) entries.
    const addressConditions = [
        sql`LOWER(TRIM(${streetviewCache.address})) = ${address.toLowerCase()}`,
        sql`LOWER(TRIM(${streetviewCache.city})) = ${city.toLowerCase()}`,
        sql`LOWER(TRIM(${streetviewCache.state})) = ${state.toLowerCase()}`,
        sql`${streetviewCache.expiresAt} > NOW()`,
    ];

    let cachedEntry = await db
        .select()
        .from(streetviewCache)
        .where(and(...addressConditions, sql`TRIM(${streetviewCache.size}) = ${size}`))
        .limit(1);

    if (cachedEntry.length === 0) {
        cachedEntry = await db
            .select()
            .from(streetviewCache)
            .where(and(...addressConditions))
            .limit(1);
    }

    if (cachedEntry.length === 0) return null;

    return buildCacheResult(cachedEntry[0]);
}

/**
 * Checks Google Street View metadata API to see if image is available.
 * Free endpoint — no charge even when status is not OK.
 */
async function checkMetadata(location: string, apiKey: string): Promise<{ status: string }> {
    const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(location)}&key=${apiKey}`;

    try {
        const metadataResponse = await fetch(metadataUrl);
        const metadata = await metadataResponse.json();

        console.log(`[STREETVIEW METADATA] Status: ${metadata.status} for location: ${location}`);

        return metadata;
    } catch (error) {
        console.error('[STREETVIEW METADATA] Error checking metadata:', error);
        throw new Error('Error checking Street View availability');
    }
}

/**
 * Fetches the actual Street View image from Google API.
 */
async function fetchStreetviewImage(
    location: string,
    size: string,
    apiKey: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(location)}&key=${apiKey}`;

    try {
        const imageResponse = await fetch(streetViewUrl);

        if (!imageResponse.ok) {
            const responseText = await imageResponse.text();
            console.error('Failed to fetch Street View image:', {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
                response: responseText.substring(0, 500),
                location,
            });
            return null;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

        return { buffer, contentType };
    } catch (error) {
        console.error('[STREETVIEW] Error fetching image:', error);
        return null;
    }
}

/**
 * Fetches a satellite image from Google Maps Static API.
 * Uses zoom=19 for close overhead view of the property.
 * Note: always returns an image (even for unknown addresses), no metadata pre-check needed.
 */
async function fetchSatelliteImage(
    location: string,
    size: string,
    apiKey: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(location)}&zoom=19&size=${size}&maptype=satellite&key=${apiKey}`;

    try {
        const imageResponse = await fetch(satelliteUrl);

        if (!imageResponse.ok) {
            console.error('[SATELLITE] Failed to fetch satellite image:', {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
                location,
            });
            return null;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);
        const contentType = imageResponse.headers.get('content-type') || 'image/png';

        return { buffer, contentType };
    } catch (error) {
        console.error('[SATELLITE] Error fetching satellite image:', error);
        return null;
    }
}

/**
 * Caches a successful image result (streetview or satellite). Uploads to Supabase Storage and
 * stores the resulting path; only falls back to persisting the raw bytea when the upload fails.
 * @returns the public CDN URL when the image was stored, otherwise null
 */
async function cacheImage(
    address: string,
    city: string,
    state: string,
    size: string,
    sfrPropertyId: number | undefined,
    imageData: Buffer,
    contentType: string,
    imageSource: 'streetview' | 'satellite',
): Promise<{ publicUrl: string | null }> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS[imageSource]);

    const ext = imageExtension(contentType);
    const path = storageKey({ address, city, state, size, ext });
    const publicUrl = await uploadToStorage(path, imageData, contentType);

    try {
        await db.insert(streetviewCache).values({
            sfrPropertyId: sfrPropertyId ?? null,
            address,
            city,
            state,
            size,
            // When the upload succeeded, keep only the storage path — no bytea bloat.
            imageData: publicUrl ? null : imageData,
            storagePath: publicUrl ? path : null,
            contentType,
            metadataStatus: 'OK',
            imageSource,
            expiresAt,
        });
        console.log(
            `[STREETVIEW CACHE] Stored ${imageSource} image (${publicUrl ? 'storage' : 'bytea'}), expires: ${expiresAt.toISOString()}`,
        );
    } catch (cacheError) {
        // Log error but don't fail the request — image will still be served
        console.error('[STREETVIEW CACHE] Error storing in cache:', cacheError);
    }

    return { publicUrl };
}

/**
 * Caches a negative result (no image available from any source).
 */
async function cacheNegativeResult(
    address: string,
    city: string,
    state: string,
    size: string,
    sfrPropertyId: number | undefined,
    status: string,
): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS.noImage);

    try {
        await db.insert(streetviewCache).values({
            sfrPropertyId: sfrPropertyId ?? null,
            address,
            city,
            state,
            size,
            imageData: null,
            storagePath: null,
            contentType: null,
            metadataStatus: status,
            imageSource: null,
            expiresAt,
        });
        console.log(
            `[STREETVIEW CACHE] Cached negative result (status: ${status}), expires: ${expiresAt.toISOString()}`,
        );
    } catch (cacheError) {
        console.error('[STREETVIEW CACHE] Error storing negative result in cache:', cacheError);
        // Don't throw — caching errors shouldn't fail the request
    }
}
