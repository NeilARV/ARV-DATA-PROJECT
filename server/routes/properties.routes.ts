import { Router } from "express";
import { db } from "server/storage";
import { properties } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { insertPropertySchema, companyContacts, updatePropertySchema } from "@shared/schema";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison } from "server/utils/normalizeCompanyName";
import { eq, sql, or, and } from "drizzle-orm";
import pLimit from "p-limit";

const router = Router();

// Get all properties
router.get("/", async (req, res) => {
    try {

        const { zipcode, city, county, hasDateSold } = req.query;

        const conditions = []

        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase()
            conditions.push(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
            )
        }

        if (zipcode) {
            const normalizedZipcode = zipcode.toString().trim()
            conditions.push(
                sql`TRIM(${properties.zipCode}) = ${normalizedZipcode}`
            )
        }

        if (city) {
            const normalizedCity = city.toString().trim().toLowerCase()
            conditions.push(
                sql`LOWER(TRIM(${properties.city})) = ${normalizedCity}`
            )
        }

        if (hasDateSold === "true") {
            conditions.push(
                sql`${properties.dateSold} IS NOT NULL`
            )
        }

        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

        let query = db.select().from(properties);
        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        const results = await query.execute()

        console.log("Properties Length: ", results.length)
        
        res.status(200).json(results);
      
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
        let enriched = { ...propertyData };

        // Geocode if lat/lng not provided or invalid
        const hasValidCoords =
        propertyData.latitude != null &&
        propertyData.longitude != null &&
        !isNaN(Number(propertyData.latitude)) &&
        !isNaN(Number(propertyData.longitude));

        if (!hasValidCoords) {
            console.log(
                `Geocoding address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state} ${propertyData.zipCode}`,
            );
            const coords = await geocodeAddress(
                propertyData.address,
                propertyData.city,
                propertyData.state,
                propertyData.zipCode,
            );
            
            if (coords) {
                enriched.latitude = coords.lat;
                enriched.longitude = coords.lng;
            } else {
                // Geocoding failed - allow property creation without coordinates
                console.warn(
                `Geocoding unavailable for: ${propertyData.address}. Property will be created without map coordinates.`,
                );
                enriched.latitude = null;
                enriched.longitude = null;
            }
        } else {
            console.log(
                `Using provided coordinates for: ${propertyData.address} (${propertyData.latitude}, ${propertyData.longitude})`,
            );
        }

        // Look up company contact (using punctuation-insensitive comparison)
        if (propertyData.propertyOwner) {
            const normalizedOwnerForCompare = normalizeCompanyNameForComparison(propertyData.propertyOwner);
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
        }

        const [inserted] = await db
        .insert(properties)
        .values(enriched)
        .returning();
        console.log(`Property created: ${inserted.address} (ID: ${inserted.id})`);

        // Add warning in response if coordinates are missing
        if (!inserted.latitude || !inserted.longitude) {
            res.json({
                ...inserted,
                _warning:
                "Property created without map coordinates. Enable Google Geocoding API or provide latitude/longitude to display on map.",
            });
        } else {
            res.json(inserted);
        }
    } catch (error) {
        console.error("Error creating property:", error);
        res.status(500).json({ message: "Error creating property" });
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
        const { search } = req.query;
        
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }

        const searchTerm = `%${search.toString().trim().toLowerCase()}%`

            // Search all fields - no smart detection needed for suggestions
        const results = await db.select({
            id: properties.id,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zipcode: properties.zipCode
        })
        .from(properties)
        .where(
            or(
                sql`LOWER(TRIM(${properties.address})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.city})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.state})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${properties.zipCode})) LIKE ${searchTerm}`
            )
        ).limit(10);

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
router.get("/streetview", async (req, res) => {
    try {
        const { address, city, state, size = "600x400" } = req.query;

        if (!address) {
            return res.status(400).json({ message: "Address parameter is required" });
        }

        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            console.error("GOOGLE_API_KEY not configured");
            return res
                .status(500)
                .json({ message: "Street View service not configured" });
            }

        // Combine address components for the location parameter
        const locationParts = [address];
        if (city) locationParts.push(city);
        if (state) locationParts.push(state);
        const location = locationParts.join(", ");

        const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(location)}&key=${apiKey}`;

        console.log("Fetching Street View for:", location, "size:", size);

        // Fetch the image from Google and proxy it to the client
        const imageResponse = await fetch(streetViewUrl);

        if (!imageResponse.ok) {
            const responseText = await imageResponse.text();
            console.error("Failed to fetch Street View image:", {
                status: imageResponse.status,
                statusText: imageResponse.statusText,
                response: responseText.substring(0, 500), // First 500 chars of response
                location,
            });
            return res
                .status(404)
                .json({ message: "Street View image not available" });
        }

        // Set appropriate headers and stream the image to the client
        const contentType = imageResponse.headers.get("content-type");
        if (contentType) {
            res.setHeader("Content-Type", contentType);
        }
        
        res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

        // Stream the image data to the response
        const imageBuffer = await imageResponse.arrayBuffer();
        res.send(Buffer.from(imageBuffer));
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