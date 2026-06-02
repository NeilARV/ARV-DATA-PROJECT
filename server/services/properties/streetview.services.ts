import { db } from 'server/storage';
import { streetviewCache } from '@database/schemas/properties.schema';
import { eq, sql, and } from 'drizzle-orm';

export interface StreetviewImageResult {
    imageData: Buffer;
    contentType: string;
    cached: boolean;
    imageSource: 'streetview' | 'satellite';
}

export interface StreetviewErrorResult {
    message: string;
    status: string;
    reason?: string;
    cached: boolean;
}

export type StreetviewResult = StreetviewImageResult | StreetviewErrorResult;

export interface StreetviewParams {
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
 * Order: cache → Street View API → Satellite API → no image
 * @param params - Streetview parameters (address, city, state, size, propertyId)
 * @returns StreetviewResult with image data or error information
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
            await cacheImage(
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
                imageData: imageResult.buffer,
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
        await cacheImage(
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
            imageData: satelliteResult.buffer,
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

/**
 * Builds a StreetviewResult from a raw cache row.
 */
function buildCacheResult(
    cached: typeof streetviewCache.$inferSelect,
    address: string,
    city: string,
    state: string,
): StreetviewResult {
    if (!cached.imageData || cached.metadataStatus !== 'OK') {
        console.log(
            `[STREETVIEW CACHE HIT] Cached negative result (status: ${cached.metadataStatus || 'no image'}) for: ${address}, ${city}, ${state}`,
        );
        return {
            message: 'Street View image not available',
            status: cached.metadataStatus || 'NOT_AVAILABLE',
            cached: true,
        };
    }

    const source = (cached.imageSource === 'satellite' ? 'satellite' : 'streetview') as
        | 'streetview'
        | 'satellite';
    console.log(
        `[STREETVIEW CACHE HIT] Using cached ${source} image (size: ${cached.size}) for: ${address}, ${city}, ${state}`,
    );

    return {
        imageData: cached.imageData,
        contentType: cached.contentType || 'image/jpeg',
        cached: true,
        imageSource: source,
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

        if (byId.length > 0) return buildCacheResult(byId[0], address, city, state);
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

    return buildCacheResult(cachedEntry[0], address, city, state);
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
 * Caches a successful image result (streetview or satellite).
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
): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS[imageSource]);

    try {
        await db.insert(streetviewCache).values({
            sfrPropertyId: sfrPropertyId ?? null,
            address,
            city,
            state,
            size,
            imageData,
            contentType,
            metadataStatus: 'OK',
            imageSource,
            expiresAt,
        });
        console.log(
            `[STREETVIEW CACHE] Stored ${imageSource} image, expires: ${expiresAt.toISOString()}`,
        );
    } catch (cacheError) {
        // Log error but don't fail the request — image will still be served
        console.error('[STREETVIEW CACHE] Error storing in cache:', cacheError);
    }
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
