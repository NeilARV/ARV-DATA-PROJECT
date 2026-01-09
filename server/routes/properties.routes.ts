import { Router } from "express";
import { db } from "server/storage";
import { properties, streetviewCache } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { insertPropertySchema, companyContacts, updatePropertySchema } from "@shared/schema";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { normalizeToTitleCase } from "server/utils/normalizeToTitleCase";
import { fetchCounty } from "server/utils/fetchCounty";
import { getMSAFromZipCode } from "server/utils/getMSAFromZipCode";
import { eq, sql, or, and, desc, asc, gt } from "drizzle-orm";
import pLimit from "p-limit";
import dotenv from "dotenv"

dotenv.config()

const router = Router();

// Get all properties
router.get("/", async (req, res) => {
    try {

        const { 
            zipcode, 
            city, 
            county, 
            minPrice, 
            maxPrice, 
            bedrooms, 
            bathrooms, 
            propertyType, 
            status, 
            company, 
            propertyOwner, 
            hasDateSold,
            page,
            limit,
            sortBy
        } = req.query;

        // Parse pagination parameters
        const pageNum = page ? Math.max(1, parseInt(page.toString(), 10)) : 1;
        const limitNum = limit ? Math.max(1, parseInt(limit.toString(), 10)) : 10; // Default to 20 per page
        const offset = (pageNum - 1) * limitNum;

        const conditions = []

        // Company/Property Owner filter (support both 'company' and 'propertyOwner' query params)
        const ownerFilter = company || propertyOwner;
        if (ownerFilter) {
            const normalizedCompany = ownerFilter.toString().trim().toLowerCase()
            conditions.push(
                sql`LOWER(TRIM(${properties.propertyOwner})) = ${normalizedCompany}`
            )
        }

        // Status filter (can be single value or array)
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            if (statusArray.length > 0) {
                const normalizedStatuses = statusArray.map(s => s.toString().trim().toLowerCase());
                if (normalizedStatuses.length === 1) {
                    conditions.push(
                        sql`LOWER(TRIM(${properties.status})) = ${normalizedStatuses[0]}`
                    );
                } else {
                    // Use OR for multiple status values
                    conditions.push(
                        or(...normalizedStatuses.map(s => 
                            sql`LOWER(TRIM(${properties.status})) = ${s}`
                        )) as any
                    );
                }
            }
        }

        // Property Type filter (can be single value or array)
        if (propertyType) {
            const typeArray = Array.isArray(propertyType) ? propertyType : [propertyType];
            if (typeArray.length > 0) {
                const normalizedTypes = typeArray.map(t => t.toString().trim().toLowerCase());
                if (normalizedTypes.length === 1) {
                    conditions.push(
                        sql`LOWER(TRIM(${properties.propertyType})) = ${normalizedTypes[0]}`
                    );
                } else {
                    // Use OR for multiple property type values
                    conditions.push(
                        or(...normalizedTypes.map(t => 
                            sql`LOWER(TRIM(${properties.propertyType})) = ${t}`
                        )) as any
                    );
                }
            }
        }

        // Bathrooms filter (minimum bathrooms)
        if (bathrooms) {
            const bathroomsStr = bathrooms.toString().trim().toLowerCase();
            if (bathroomsStr !== 'any') {
                const bathroomsNum = parseFloat(bathroomsStr);
                if (!isNaN(bathroomsNum)) {
                    conditions.push(
                        sql`${properties.bathrooms} >= ${bathroomsNum}`
                    )
                }
            }
        }

        // Bedrooms filter (exact match)
        if (bedrooms) {
            const bedroomsStr = bedrooms.toString().trim().toLowerCase();
            if (bedroomsStr !== 'any') {
                const bedroomsNum = parseInt(bedroomsStr, 10);
                if (!isNaN(bedroomsNum)) {
                    conditions.push(
                        sql`${properties.bedrooms} = ${bedroomsNum}`
                    )
                }
            }
        }
        
        // Price range filter (handle min, max, or both)
        if (minPrice) {
            const minPriceNum = parseFloat(minPrice.toString());
            if (!isNaN(minPriceNum)) {
                conditions.push(
                    sql`${properties.price} >= ${minPriceNum}`
                )
            }
        }

        if (maxPrice) {
            const maxPriceNum = parseFloat(maxPrice.toString());
            if (!isNaN(maxPriceNum)) {
                conditions.push(
                    sql`${properties.price} <= ${maxPriceNum}`
                )
            }
        }

        // County filter
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase()
            conditions.push(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            )
        }

        // Zipcode filter
        if (zipcode) {
            const normalizedZipcode = zipcode.toString().trim()
            conditions.push(
                sql`TRIM(${properties.zipCode}) = ${normalizedZipcode}`
            )
        }

        // City filter
        if (city) {
            const normalizedCity = city.toString().trim().toLowerCase()
            conditions.push(
                sql`LOWER(TRIM(${properties.city})) = ${normalizedCity}`
            )
        }

        // Has Date Sold filter
        if (hasDateSold === "true") {
            conditions.push(
                sql`${properties.dateSold} IS NOT NULL`
            )
        }

        // Build where clause
        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

        // Get total count (for pagination metadata)
        let countQuery = db.select({ count: sql<number>`count(*)` }).from(properties);
        if (whereClause) {
            countQuery = countQuery.where(whereClause) as any;
        }
        const [totalResult] = await countQuery.execute();
        const total = Number(totalResult?.count || 0);

        // Get paginated results (fetch one extra to check if there are more pages)
        let query = db.select().from(properties);
        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        // Apply sorting based on sortBy parameter
        const sortByValue = sortBy?.toString() || "recently-sold";
        switch (sortByValue) {
            case "recently-sold":
                // Sort by dateSold DESC (most recent first), nulls last
                query = query.orderBy(
                    sql`CASE WHEN ${properties.dateSold} IS NULL THEN 1 ELSE 0 END`,
                    desc(properties.dateSold)
                ) as any;
                break;
            case "days-held":
                // Sort by days held (calculated from dateSold to now) DESC (longest first), nulls last
                // Calculate days held: (NOW() - dateSold) in days
                query = query.orderBy(
                    sql`CASE WHEN ${properties.dateSold} IS NULL THEN 1 ELSE 0 END`,
                    sql`(EXTRACT(EPOCH FROM (NOW() - ${properties.dateSold})) / 86400) DESC`
                ) as any;
                break;
            case "price-high-low":
                // Sort by price DESC
                query = query.orderBy(desc(properties.price)) as any;
                break;
            case "price-low-high":
                // Sort by price ASC
                query = query.orderBy(asc(properties.price)) as any;
                break;
            default:
                // Default to recently-sold
                query = query.orderBy(
                    sql`CASE WHEN ${properties.dateSold} IS NULL THEN 1 ELSE 0 END`,
                    desc(properties.dateSold)
                ) as any;
        }

        const results = await query.limit(limitNum + 1).offset(offset).execute();

        const hasMore = results.length > limitNum;
        const propertiesList = results.slice(0, limitNum);

        console.log(`Properties: ${propertiesList.length} returned, ${total} total, hasMore: ${hasMore}, page: ${pageNum}`)
        
        res.status(200).json({
            properties: propertiesList,
            total,
            hasMore,
            page: pageNum,
            limit: limitNum,
        });
      
    } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ message: "Error fetching properties" });
    }
});

// Create a single property (requires admin auth)
router.post("/", requireAdminAuth, async (req, res) => {
    try {
        console.log(
        "POST /api/properties - Raw request body:",
        JSON.stringify(req.body, null, 2),
        );

        // Validate request body with Zod schema
        const validation = insertPropertySchema.safeParse(req.body);

        if (!validation.success) {
            console.error(
                "Validation errors:",
                JSON.stringify(validation.error.errors, null, 2),
            );
            return res.status(400).json({
                message: "Invalid property data",
                errors: validation.error.errors,
            });
        }

        const propertyData = validation.data;
        console.log(
        "Validated property data:",
        JSON.stringify(propertyData, null, 2),
        );
        
        // Normalize text fields to Title Case
        // Convert empty strings to null for optional fields
        // Check if form provided company contact info (before we normalize)
        const formProvidedContactName = propertyData.companyContactName != null && 
            typeof propertyData.companyContactName === 'string' && 
            propertyData.companyContactName.trim() !== "";
        const formProvidedContactEmail = propertyData.companyContactEmail != null && 
            typeof propertyData.companyContactEmail === 'string' && 
            propertyData.companyContactEmail.trim() !== "";
        
        let enriched: any = {
            ...propertyData,
            address: normalizeToTitleCase(propertyData.address) || propertyData.address,
            city: normalizeToTitleCase(propertyData.city) || propertyData.city,
            state: propertyData.state?.toUpperCase().trim() || propertyData.state,
            // Convert empty description to null
            description: propertyData.description && typeof propertyData.description === 'string' && propertyData.description.trim() !== ""
                ? propertyData.description.trim()
                : null,
            // Convert empty imageUrl to null
            imageUrl: propertyData.imageUrl && typeof propertyData.imageUrl === 'string' && propertyData.imageUrl.trim() !== ""
                ? propertyData.imageUrl.trim()
                : null,
            // Convert empty dateSold strings to null (form sends empty string for empty date fields)
            dateSold: propertyData.dateSold && typeof propertyData.dateSold === 'string' && propertyData.dateSold.trim() !== "" 
                ? propertyData.dateSold 
                : null,
            // Convert empty company contact fields to null (will be populated from DB if owner found and form didn't provide)
            companyContactName: formProvidedContactName && typeof propertyData.companyContactName === 'string' 
                ? propertyData.companyContactName.trim() 
                : null,
            companyContactEmail: formProvidedContactEmail && typeof propertyData.companyContactEmail === 'string' 
                ? propertyData.companyContactEmail.trim() 
                : null,
        };

        // Normalize property owner if provided
        if (propertyData.propertyOwner && propertyData.propertyOwner.trim() !== "") {
            const normalizedOwnerForStorage = normalizeCompanyNameForStorage(propertyData.propertyOwner);
            enriched.propertyOwner = normalizedOwnerForStorage || propertyData.propertyOwner;
        } else {
            enriched.propertyOwner = null;
        }

        // Set default status if not provided
        if (!enriched.status) {
            enriched.status = "in-renovation";
        }

        // Set saleValue to same as price
        enriched.saleValue = enriched.price;

        // Set purchasePrice to same as price
        enriched.purchasePrice = enriched.price;

        // Set isCorporate to true (company only works with corporate entities)
        enriched.isCorporate = true;

        // Set lender to "ARV Finance"
        enriched.lenderName = "ARV Finance";

        // Set recordingDate to same as dateSold
        enriched.recordingDate = enriched.dateSold;

        // Determine MSA from zip code
        const msa = getMSAFromZipCode(enriched.zipCode);
        if (msa) {
            enriched.msa = msa;
            console.log(`MSA determined from zip code ${enriched.zipCode}: ${msa}`);
        } else {
            enriched.msa = null;
            console.log(`Could not determine MSA for zip code: ${enriched.zipCode}`);
        }

        // Geocode if lat/lng not provided or invalid
        const hasValidCoords =
            enriched.latitude != null &&
            enriched.longitude != null &&
            !isNaN(Number(enriched.latitude)) &&
            !isNaN(Number(enriched.longitude));

        if (!hasValidCoords) {
            console.log(
                `Geocoding address: ${enriched.address}, ${enriched.city}, ${enriched.state} ${enriched.zipCode}`,
            );
            const coords = await geocodeAddress(
                enriched.address,
                enriched.city,
                enriched.state,
                enriched.zipCode,
            );
            
            if (coords) {
                enriched.latitude = coords.lat;
                enriched.longitude = coords.lng;
                console.log(`Geocoded to: (${coords.lat}, ${coords.lng})`);
            } else {
                // Geocoding failed - allow property creation without coordinates
                console.warn(
                `Geocoding unavailable for: ${enriched.address}. Property will be created without map coordinates.`,
                );
                enriched.latitude = null;
                enriched.longitude = null;
            }
        } else {
            console.log(
                `Using provided coordinates for: ${enriched.address} (${enriched.latitude}, ${enriched.longitude})`,
            );
        }

        // Get county from longitude and latitude - do this after geocoding in case coordinates were just added
        if (enriched.latitude && enriched.longitude) {
            console.log(`Fetching county for coordinates: (${enriched.longitude}, ${enriched.latitude})`);
            const county = await fetchCounty(enriched.longitude, enriched.latitude);
            if (county) {
                enriched.county = county;
                console.log(`County found: ${county}`);
            } else {
                // County not found - use "UNKNOWN" as default (required field)
                enriched.county = "UNKNOWN";
                console.warn(`County not found for coordinates, using "UNKNOWN"`);
            }
        } else {
            // No coordinates available - use "UNKNOWN" as default (required field)
            enriched.county = "UNKNOWN";
            console.warn(`No coordinates available, cannot determine county. Using "UNKNOWN"`);
        }

        // Handle company contact lookup (using punctuation-insensitive comparison)
        // Only populate contact fields from DB if propertyOwner exists AND form didn't provide contact info
        if (enriched.propertyOwner) {
            const normalizedOwnerForCompare = normalizeCompanyNameForComparison(enriched.propertyOwner);
            const allContacts = await db.select().from(companyContacts);
            
            const contact = allContacts.find(c => {
                const normalizedContact = normalizeCompanyNameForComparison(c.companyName);
                return normalizedContact && normalizedContact === normalizedOwnerForCompare;
            });

            if (contact) {
                // If form didn't provide contact info, use existing contact's info from DB
                if (!formProvidedContactName && !formProvidedContactEmail) {
                    enriched.companyContactName = contact.contactName || null;
                    enriched.companyContactEmail = contact.contactEmail || null;
                    console.log(`Populated contact info from DB for: ${contact.companyName}`);
                } else {
                    console.log(`Using form-provided contact info for: ${enriched.propertyOwner}`);
                }
                // Use the existing contact's company name for consistency
                enriched.propertyOwner = contact.companyName;
            } else {
                // Property owner provided but no contact found in DB
                // If form provided contact info, keep it (already set above)
                // If form didn't provide contact info, keep null values (already set above)
                console.log(`No existing company contact found in DB for: ${enriched.propertyOwner}`);
            }
        } else {
            // No property owner - contact fields remain null (already set above)
            enriched.companyContactName = null;
            enriched.companyContactEmail = null;
        }

        console.log("Final enriched property data:", JSON.stringify(enriched, null, 2));

        const [inserted] = await db
            .insert(properties)
            .values(enriched)
            .returning();
        
        console.log(`Property created: ${inserted.address} (ID: ${inserted.id})`);

        // Add warning in response if coordinates or county are missing
        const warnings: string[] = [];
        if (!inserted.latitude || !inserted.longitude) {
            warnings.push(
                "Property created without map coordinates. Enable Google Geocoding API or provide latitude/longitude to display on map."
            );
        }
        if (inserted.county === "UNKNOWN") {
            warnings.push(
                "County could not be determined. The property has been saved with county set to 'UNKNOWN'."
            );
        }

        if (warnings.length > 0) {
            res.json({
                ...inserted,
                _warning: warnings.join(" "),
            });
        } else {
            res.json(inserted);
        }
    } catch (error) {
        console.error("Error creating property:", error);
        res.status(500).json({ 
            message: "Error creating property",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// Get minimal property data for map pins
router.get("/map", async (req, res) => {
    try {
        const { county } = req.query;

        const conditions = [];

        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            conditions.push(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            );
        }

        const whereClause = conditions.length > 0 ? conditions[0] : undefined;

        // Select only minimal fields needed for map pins and filtering
        const query = db.select({
            id: properties.id,
            latitude: properties.latitude,
            longitude: properties.longitude,
            address: properties.address,
            city: properties.city,
            zipcode: properties.zipCode,
            county: properties.county,
            propertyType: properties.propertyType,
            bedrooms: properties.bedrooms,
            bathrooms: properties.bathrooms,
            price: properties.price,
            status: properties.status,
            propertyOwner: properties.propertyOwner
        }).from(properties);

        const results = whereClause 
            ? await query.where(whereClause).execute()
            : await query.execute();

        console.log("Properties map pins:", results.length);

        res.status(200).json(results);

    } catch (error) {
        console.error("Error fetching properties map pins:", error);
        res.status(500).json({ message: "Error fetching properties map pins" });
    }
});

// Get property suggestions for search
router.get("/suggestions", async (req, res) => {
    try {
        const { search, county } = req.query;
        
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }

        const searchTerm = `%${search.toString().trim().toLowerCase()}%`;
        const conditions = [];

        // Add search conditions
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.address})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.city})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.state})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.zipCode})) LIKE ${searchTerm}`
            )
        );

        // Add county filter if provided
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            conditions.push(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            );
        }

        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

        // Search all fields - no smart detection needed for suggestions
        let query = db.select({
            id: properties.id,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zipcode: properties.zipCode
        })
        .from(properties);

        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        const results = await query.limit(5);

        res.status(200).json(results);

    } catch (error) {
        console.error("Error fetching property suggestions:", error);
        res.status(500).json({ message: "Error fetching property suggestions" });
    }
});

// Upload properties with chunked processing and controlled concurrency (requires admin auth)
router.post("/upload", requireAdminAuth, async (req, res) => {
    try {
        const propertiesToUpload = req.body;

        if (!Array.isArray(propertiesToUpload)) {
            return res
                .status(400)
                .json({ message: "Expected an array of properties" });
        }

        console.log(
        `[UPLOAD] Starting upload of ${propertiesToUpload.length} properties`,
        );

        const geocodingFailures: string[] = [];
        const successfulProperties: any[] = [];

        // Limit concurrent geocoding to 3 requests at a time for production reliability
        const limit = pLimit(3);
        const CHUNK_SIZE = 10;

        // Process properties in chunks to avoid timeouts
        for (let i = 0; i < propertiesToUpload.length; i += CHUNK_SIZE) {
            const chunk = propertiesToUpload.slice(i, i + CHUNK_SIZE);
            console.log(
                `[UPLOAD] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(propertiesToUpload.length / CHUNK_SIZE)} (${chunk.length} properties)`,
            );

            // Process chunk with controlled concurrency
            const geocodingTasks = chunk.map((prop) =>
                limit(async () => {
                let enriched = { ...prop };
                let shouldInsert = true;

                // Geocode if lat/lng not provided or invalid
                if (!prop.latitude || !prop.longitude || isNaN(prop.latitude) || isNaN(prop.longitude)) {
                    const coords = await geocodeAddress(
                        prop.address,
                        prop.city,
                        prop.state,
                        prop.zipCode,
                    );
                    if (coords) {
                        enriched.latitude = coords.lat;
                        enriched.longitude = coords.lng;
                    } else {
                        console.warn(`Geocoding failed for: ${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`);
                        geocodingFailures.push(`${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`,);
                        shouldInsert = false;
                    }
                }

                // Look up company contact (using punctuation-insensitive comparison)
                if (shouldInsert && prop.propertyOwner) {
                    try {
                        const normalizedOwnerForCompare = normalizeCompanyNameForComparison(prop.propertyOwner);
                        const allContacts = await db.select().from(companyContacts);
                        
                        const contact = allContacts.find(c => {
                            const normalizedContact = normalizeCompanyNameForComparison(c.companyName);
                            return normalizedContact && normalizedContact === normalizedOwnerForCompare;
                        });

                        if (contact) {
                            enriched.companyContactName = contact.contactName;
                            enriched.companyContactEmail = contact.contactEmail;
                            // Use the existing contact's name for consistency
                            enriched.propertyOwner = contact.companyName;
                        }
                    } catch (contactError) {
                        console.error(`Error looking up contact for ${prop.propertyOwner}:`, contactError);
                    }
                }

                return { enriched, shouldInsert };
                }),
            );

            // Wait for all geocoding tasks in this chunk to complete
            const results = await Promise.all(geocodingTasks);

            // Collect successful properties from this chunk
            results.forEach(({ enriched, shouldInsert }) => {
                if (shouldInsert) {
                    successfulProperties.push(enriched);
                }
            });

            // Insert this chunk into database immediately to avoid memory buildup
            if (results.some((r) => r.shouldInsert)) {
                const chunkToInsert = results
                    .filter((r) => r.shouldInsert)
                    .map((r) => r.enriched);

                if (chunkToInsert.length > 0) {
                    await db.insert(properties).values(chunkToInsert);
                    console.log(`[UPLOAD] Inserted ${chunkToInsert.length} properties from chunk`);
                }
            }
        }

        console.log(`[UPLOAD] Upload complete: ${successfulProperties.length} properties inserted, ${geocodingFailures.length} failed`);

        const response: any = {
            count: successfulProperties.length,
            total: propertiesToUpload.length,
            success: true,
        };

        if (geocodingFailures.length > 0) {
            response.warnings = {
                message: `Failed to geocode ${geocodingFailures.length} propert${geocodingFailures.length === 1 ? "y" : "ies"}. ${geocodingFailures.length === 1 ? "This property was" : "These properties were"} not imported. Please verify the addresses and try again.`,
                failedAddresses: geocodingFailures,
            };
        }

        res.status(200).json(response);
    } catch (error) {
        console.error("[UPLOAD ERROR]", error);
        res.status(500).json({ message: "Error uploading properties" });
    }
});

// Proxy Street View image to keep API key secure on server
// Now with database caching to reduce Google API calls
router.get("/streetview", async (req, res) => {
    try {
        const { address, city, state, size = "600x400", propertyId } = req.query;

        if (!address) {
            return res.status(400).json({ message: "Address parameter is required" });
        }

        const normalizedAddress = address.toString().trim();
        const normalizedCity = city?.toString().trim() || "";
        const normalizedState = state?.toString().trim() || "";
        const normalizedSize = size.toString().trim();

        // Check cache first - look for non-expired entry matching address+city+state+size
        // If propertyId is provided, also check for that
        const cacheConditions = [
            sql`LOWER(TRIM(${streetviewCache.address})) = ${normalizedAddress.toLowerCase()}`,
            sql`LOWER(TRIM(${streetviewCache.city})) = ${normalizedCity.toLowerCase()}`,
            sql`LOWER(TRIM(${streetviewCache.state})) = ${normalizedState.toLowerCase()}`,
            sql`TRIM(${streetviewCache.size}) = ${normalizedSize}`,
            sql`${streetviewCache.expiresAt} > NOW()`
        ];

        if (propertyId) {
            cacheConditions.push(eq(streetviewCache.propertyId, propertyId.toString()));
        }

        const cachedEntry = await db
            .select()
            .from(streetviewCache)
            .where(and(...cacheConditions))
            .limit(1);

        if (cachedEntry.length > 0) {
            const cached = cachedEntry[0];
            
            // Check if this is a cached negative result (no image available)
            if (!cached.imageData || cached.metadataStatus !== "OK") {
                console.log(`[STREETVIEW CACHE HIT] Cached negative result (status: ${cached.metadataStatus || 'no image'}) for: ${normalizedAddress}, ${normalizedCity}, ${normalizedState}`);
                return res
                    .status(404)
                    .json({ 
                        message: "Street View image not available",
                        status: cached.metadataStatus || "NOT_AVAILABLE",
                        cached: true
                    });
            }
            
            console.log(`[STREETVIEW CACHE HIT] Using cached image for: ${normalizedAddress}, ${normalizedCity}, ${normalizedState}`);
            
            // imageData is already a Buffer from BYTEA column
            const imageBuffer = cached.imageData;
            
            // Set appropriate headers
            res.setHeader("Content-Type", cached.contentType || "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
            
            res.send(imageBuffer);
            return;
        }

        // Cache miss - check metadata API first to avoid charges for unavailable images
        console.log(`[STREETVIEW CACHE MISS] Checking metadata for: ${normalizedAddress}, ${normalizedCity}, ${normalizedState}`);

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("GOOGLE_API_KEY not configured");
            return res
                .status(500)
                .json({ message: "Street View service not configured" });
        }

        // Combine address components for the location parameter
        const locationParts = [normalizedAddress];
        if (normalizedCity) locationParts.push(normalizedCity);
        if (normalizedState) locationParts.push(normalizedState);
        const location = locationParts.join(", ");

        // Check metadata API first to see if image is available (avoids charges for unavailable images)
        const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(location)}&key=${apiKey}`;
        
        let metadataResponse;
        let metadata;
        try {
            metadataResponse = await fetch(metadataUrl);
            metadata = await metadataResponse.json();
            
            console.log(`[STREETVIEW METADATA] Status: ${metadata.status} for location: ${location}`);
            
            // If status is not "OK", image is not available - don't fetch image
            if (metadata.status !== "OK") {
                // Cache the negative result (no image available) to avoid repeated metadata checks
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now so we keep checking if google added image
                
                try {
                    await db.insert(streetviewCache).values({
                        propertyId: propertyId?.toString() || null,
                        address: normalizedAddress,
                        city: normalizedCity,
                        state: normalizedState,
                        size: normalizedSize,
                        imageData: null, // No image available
                        contentType: null, // No content-type because image not available
                        metadataStatus: metadata.status, // Store the status
                        expiresAt: expiresAt,
                    });
                    console.log(`[STREETVIEW CACHE] Cached negative result (status: ${metadata.status}), expires: ${expiresAt.toISOString()}`);
                } catch (cacheError) {
                    console.error("[STREETVIEW CACHE] Error storing negative result in cache:", cacheError);
                }
                
                return res
                    .status(404)
                    .json({ 
                        message: "Street View image not available",
                        status: metadata.status,
                        reason: metadata.status === "ZERO_RESULTS" 
                            ? "No panorama found near this location"
                            : metadata.status === "NOT_FOUND"
                            ? "Address not found"
                            : "Street View not available for this location"
                    });
            }
        } catch (metadataError) {
            console.error("[STREETVIEW METADATA] Error checking metadata:", metadataError);
            // If metadata check fails, we could proceed to fetch image anyway, but for safety, return error
            return res
                .status(500)
                .json({ message: "Error checking Street View availability" });
        }

        // Metadata check passed (status === "OK") - now fetch the actual image
        console.log(`[STREETVIEW] Fetching image from Google API for: ${location}`);
        const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${normalizedSize}&location=${encodeURIComponent(location)}&key=${apiKey}`;

        // Fetch the image from Google
        const imageResponse = await fetch(streetViewUrl);

        if (!imageResponse.ok) {
            const responseText = await imageResponse.text();
            console.error("Failed to fetch Street View image:", {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
                response: responseText.substring(0, 500),
                location,
            });
            return res
                .status(404)
                .json({ message: "Street View image not available" });
        }

        // Get image data
        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

        // Store in cache (store as binary Buffer - BYTEA handles it directly)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 29); // 29 days from now (1 less than google requriements to ensure compliance)

        try {
            await db.insert(streetviewCache).values({
                propertyId: propertyId?.toString() || null,
                address: normalizedAddress,
                city: normalizedCity,
                state: normalizedState,
                size: normalizedSize,
                imageData: buffer, // Store as Buffer - BYTEA column handles binary data directly
                contentType: contentType,
                metadataStatus: "OK", // Store successful status
                expiresAt: expiresAt,
            });
            console.log(`[STREETVIEW CACHE] Stored new image in cache, expires: ${expiresAt.toISOString()}`);
        } catch (cacheError) {
            // Log error but don't fail the request - image will still be served
            console.error("[STREETVIEW CACHE] Error storing in cache:", cacheError);
        }

        // Set appropriate headers and send the image
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

        res.send(buffer);
    } catch (error) {
        console.error("Error fetching Street View image:", error);
        res.status(500).json({ message: "Error fetching Street View image" });
    }
});

// Delete all properties (requires admin auth)
router.delete("/", requireAdminAuth, async (_req, res) => {
    try {
        await db.delete(properties);
        res.json({ message: "All properties deleted" });
    } catch (error) {
        console.error("Error deleting properties:", error);
        res.status(500).json({ message: "Error deleting properties" });
    }
});

// Delete a single property by ID (requires admin auth)
router.delete("/:id", requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[DELETE] Attempting to delete property ID: ${id}`);
        const deleted = await db
            .delete(properties)
            .where(eq(properties.id, id))
            .returning();

        if (deleted.length === 0) {
            console.warn(`[DELETE] Property not found: ${id}`);
            return res.status(404).json({ message: "Property not found" });
        }

        console.log(`[DELETE] Successfully deleted property: ${deleted[0].address}`);
        res.json({
            message: "Property deleted successfully",
            property: deleted[0],
        });

    } catch (error) {
        console.error("[DELETE ERROR]", error);
        res.status(500).json({
            message: `Error deleting property: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
    }
});

// Get a single property by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [property] = await db
            .select()
            .from(properties)
            .where(eq(properties.id, id))
            .limit(1);

        if (!property) {
            return res.status(404).json({ message: "Property not found" });
        }

        res.status(200).json(property);
    } catch (error) {
        console.error("Error fetching property:", error);
        res.status(500).json({ message: "Error fetching property" });
    }
});

  // Update a single property by ID (requires admin auth)
router.patch("/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const rawUpdates = req.body;

      console.log(`[UPDATE] Attempting to update property ID: ${id}`);
      console.log(`[UPDATE] Raw updates:`, JSON.stringify(rawUpdates, null, 2));

      // Validate request body with Zod schema
      const validation = updatePropertySchema.safeParse(rawUpdates);
        if (!validation.success) {
            console.error("[UPDATE] Validation errors:", JSON.stringify(validation.error.errors, null, 2));
            return res.status(400).json({
            message: "Invalid update data",
            errors: validation.error.errors,
            });
        }

      const updates = validation.data;

        // Ensure we have something to update
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        // Check if property exists
        const existing = await db
            .select()
            .from(properties)
            .where(eq(properties.id, id))
            .limit(1);
        if (existing.length === 0) {
            console.warn(`[UPDATE] Property not found: ${id}`);
            return res.status(404).json({ message: "Property not found" });
        }

      // If propertyOwner changed, update company contact info (using punctuation-insensitive comparison)
        const finalUpdates: Record<string, any> = { ...updates };
        if (updates.propertyOwner !== undefined) {
            if (updates.propertyOwner) {
                const normalizedOwnerForCompare = normalizeCompanyNameForComparison(updates.propertyOwner);
                const allContacts = await db.select().from(companyContacts);
                
                const contact = allContacts.find(c => {
                    const normalizedContact = normalizeCompanyNameForComparison(c.companyName);
                    return normalizedContact && normalizedContact === normalizedOwnerForCompare;
                });

                if (contact) {
                    finalUpdates.companyContactName = contact.contactName;
                    finalUpdates.companyContactEmail = contact.contactEmail;
                    // Use the existing contact's name for consistency
                    finalUpdates.propertyOwner = contact.companyName;
                } else {
                    // Clear contact info if owner changed to unknown company
                    finalUpdates.companyContactName = null;
                    finalUpdates.companyContactEmail = null;
                }
            } else {
                // Clear contact info if owner removed
                finalUpdates.companyContactName = null;
                finalUpdates.companyContactEmail = null;
            }
        }

        console.log(`[UPDATE] Validated updates:`, JSON.stringify(finalUpdates, null, 2));

        // Perform the update
        const [updated] = await db
            .update(properties)
            .set(finalUpdates)
            .where(eq(properties.id, id))
            .returning();

        console.log(`[UPDATE] Successfully updated property: ${updated.address}`);
        res.json(updated);
    } catch (error) {
        console.error("[UPDATE ERROR]", error);
        res.status(500).json({
            message: `Error updating property: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
    }
});

export default router