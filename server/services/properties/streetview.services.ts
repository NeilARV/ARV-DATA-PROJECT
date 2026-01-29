import { db } from "server/storage";
import { streetviewCache } from "@database/schemas/properties.schema";
import { eq, sql, and } from "drizzle-orm";

export interface StreetviewImageResult {
    imageData: Buffer;
    contentType: string;
    cached: boolean;
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
    propertyId?: string;
}

/**
 * Gets a Street View image for the given address
 * Checks cache first, then Google API if needed
 * @param params - Streetview parameters (address, city, state, size, propertyId)
 * @returns StreetviewResult with image data or error information
 */
export async function getStreetviewImage(params: StreetviewParams): Promise<StreetviewResult> {
    const {
        address,
        city = "",
        state = "",
        size = "600x400",
        propertyId
    } = params;

    const normalizedAddress = address.trim();
    const normalizedCity = city.trim();
    const normalizedState = state.trim();
    const normalizedSize = size.trim();

    // Check cache first - look for non-expired entry matching address+city+state+size
    const cachedResult = await checkCache(normalizedAddress, normalizedCity, normalizedState, normalizedSize, propertyId);
    
    if (cachedResult) {
        return cachedResult;
    }

    // Cache miss - check metadata API first to avoid charges for unavailable images
    console.log(`[STREETVIEW CACHE MISS] Checking metadata for: ${normalizedAddress}, ${normalizedCity}, ${normalizedState}`);

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("GOOGLE_API_KEY not configured");
        throw new Error("Street View service not configured");
    }

    // Combine address components for the location parameter
    const locationParts = [normalizedAddress];
    if (normalizedCity) locationParts.push(normalizedCity);
    if (normalizedState) locationParts.push(normalizedState);
    const location = locationParts.join(", ");

    // Check metadata API first to see if image is available (avoids charges for unavailable images)
    const metadata = await checkMetadata(location, apiKey);
    
    if (metadata.status !== "OK") {
        // Cache the negative result
        await cacheNegativeResult(
            normalizedAddress,
            normalizedCity,
            normalizedState,
            normalizedSize,
            propertyId,
            metadata.status
        );

        return {
            message: "Street View image not available",
            status: metadata.status,
            reason: metadata.status === "ZERO_RESULTS"
                ? "No panorama found near this location"
                : metadata.status === "NOT_FOUND"
                ? "Address not found"
                : "Street View not available for this location",
            cached: false
        };
    }

    // Metadata check passed (status === "OK") - now fetch the actual image
    console.log(`[STREETVIEW] Fetching image from Google API for: ${location}`);
    const imageResult = await fetchStreetviewImage(location, normalizedSize, apiKey);

    if (!imageResult) {
        return {
            message: "Street View image not available",
            status: "ERROR",
            cached: false
        };
    }

    // Store in cache
    await cacheImage(
        normalizedAddress,
        normalizedCity,
        normalizedState,
        normalizedSize,
        propertyId,
        imageResult.buffer,
        imageResult.contentType
    );

    return {
        imageData: imageResult.buffer,
        contentType: imageResult.contentType,
        cached: false
    };
}

/**
 * Checks the cache for a streetview image
 * @returns StreetviewResult if cached, null if cache miss
 */
async function checkCache(
    address: string,
    city: string,
    state: string,
    size: string,
    propertyId?: string
): Promise<StreetviewResult | null> {
    const cacheConditions = [
        sql`LOWER(TRIM(${streetviewCache.address})) = ${address.toLowerCase()}`,
        sql`LOWER(TRIM(${streetviewCache.city})) = ${city.toLowerCase()}`,
        sql`LOWER(TRIM(${streetviewCache.state})) = ${state.toLowerCase()}`,
        sql`TRIM(${streetviewCache.size}) = ${size}`,
        sql`${streetviewCache.expiresAt} > NOW()`
    ];

    if (propertyId) {
        cacheConditions.push(eq(streetviewCache.propertyId, propertyId));
    }

    const cachedEntry = await db
        .select()
        .from(streetviewCache)
        .where(and(...cacheConditions))
        .limit(1);

    if (cachedEntry.length === 0) {
        return null;
    }

    const cached = cachedEntry[0];
    
    // Check if this is a cached negative result (no image available)
    if (!cached.imageData || cached.metadataStatus !== "OK") {
        console.log(`[STREETVIEW CACHE HIT] Cached negative result (status: ${cached.metadataStatus || 'no image'}) for: ${address}, ${city}, ${state}`);
        return {
            message: "Street View image not available",
            status: cached.metadataStatus || "NOT_AVAILABLE",
            cached: true
        };
    }
    
    console.log(`[STREETVIEW CACHE HIT] Using cached image for: ${address}, ${city}, ${state}`);
    
    // imageData is Buffer | null, but we've already checked it's not null above
    return {
        imageData: cached.imageData!,
        contentType: cached.contentType || "image/jpeg",
        cached: true
    };
}

/**
 * Checks Google Street View metadata API to see if image is available
 */
async function checkMetadata(location: string, apiKey: string): Promise<{ status: string }> {
    const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(location)}&key=${apiKey}`;
    
    try {
        const metadataResponse = await fetch(metadataUrl);
        const metadata = await metadataResponse.json();
        
        console.log(`[STREETVIEW METADATA] Status: ${metadata.status} for location: ${location}`);
        
        return metadata;
    } catch (error) {
        console.error("[STREETVIEW METADATA] Error checking metadata:", error);
        throw new Error("Error checking Street View availability");
    }
}

/**
 * Fetches the actual Street View image from Google API
 */
async function fetchStreetviewImage(
    location: string,
    size: string,
    apiKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(location)}&key=${apiKey}`;

    try {
        const imageResponse = await fetch(streetViewUrl);

        if (!imageResponse.ok) {
            const responseText = await imageResponse.text();
            console.error("Failed to fetch Street View image:", {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
                response: responseText.substring(0, 500),
                location,
            });
            return null;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

        return { buffer, contentType };
    } catch (error) {
        console.error("[STREETVIEW] Error fetching image:", error);
        return null;
    }
}

/**
 * Caches a negative result (no image available)
 */
async function cacheNegativeResult(
    address: string,
    city: string,
    state: string,
    size: string,
    propertyId: string | undefined,
    status: string
): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now so we keep checking if google added image
    
    try {
        await db.insert(streetviewCache).values({
            propertyId: propertyId || null,
            address,
            city,
            state,
            size,
            imageData: null,
            contentType: null,
            metadataStatus: status,
            expiresAt: expiresAt,
        });
        console.log(`[STREETVIEW CACHE] Cached negative result (status: ${status}), expires: ${expiresAt.toISOString()}`);
    } catch (cacheError) {
        console.error("[STREETVIEW CACHE] Error storing negative result in cache:", cacheError);
        // Don't throw - caching errors shouldn't fail the request
    }
}

/**
 * Caches a successful image result
 */
async function cacheImage(
    address: string,
    city: string,
    state: string,
    size: string,
    propertyId: string | undefined,
    imageData: Buffer,
    contentType: string
): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 29); // 29 days from now (1 less than google requirements to ensure compliance)

    try {
        await db.insert(streetviewCache).values({
            propertyId: propertyId || null,
            address,
            city,
            state,
            size,
            imageData: imageData,
            contentType: contentType,
            metadataStatus: "OK",
            expiresAt: expiresAt,
        });
        console.log(`[STREETVIEW CACHE] Stored new image in cache, expires: ${expiresAt.toISOString()}`);
    } catch (cacheError) {
        // Log error but don't fail the request - image will still be served
        console.error("[STREETVIEW CACHE] Error storing in cache:", cacheError);
    }
}

