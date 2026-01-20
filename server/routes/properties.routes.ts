import { Router } from "express";
import { db } from "server/storage";
import { properties } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { insertPropertySchema, updatePropertySchema } from "@shared/schema";
import { companies } from "../../database/schemas/companies.schema";
import { 
    properties as propertiesV2, 
    addresses, 
    structures, 
    lastSales 
} from "../../database/schemas/properties.schema";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { normalizeToTitleCase } from "server/utils/normalizeToTitleCase";
import { normalizeAddress } from "server/utils/normalizeAddress";
import { fetchCounty } from "server/utils/fetchCounty";
import { getMSAFromZipCode } from "server/utils/getMSAFromZipCode";
import { eq, sql, or, and, desc, asc, getTableColumns } from "drizzle-orm";
import pLimit from "p-limit";
import dotenv from "dotenv";
import { MapsController, StreetviewController, PropertiesController } from "server/controllers/properties";

dotenv.config()

const router = Router();

// Get all properties
router.get("/", PropertiesController.getProperties);

// Create a single property (requires admin auth)
router.post("/", requireAdminAuth, async (req, res) => {
    try {
        console.log("POST /api/properties - Raw request body:", JSON.stringify(req.body, null, 2));

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
        console.log("Validated property data:", JSON.stringify(propertyData, null, 2));
        
        // Normalize text fields to Title Case
        // Convert empty strings to null for optional fields
        // Check if form provided company contact info (before we normalize)
        // Type assertion needed because these fields exist in insertPropertySchema but not in the table
        const propertyDataWithCompany = propertyData as typeof propertyData & {
            companyContactName?: string | null;
            companyContactEmail?: string | null;
            propertyOwner?: string | null;
        };
        const formProvidedContactName = propertyDataWithCompany.companyContactName != null && 
            typeof propertyDataWithCompany.companyContactName === 'string' && 
            propertyDataWithCompany.companyContactName.trim() !== "";
        const formProvidedContactEmail = propertyDataWithCompany.companyContactEmail != null && 
            typeof propertyDataWithCompany.companyContactEmail === 'string' && 
            propertyDataWithCompany.companyContactEmail.trim() !== "";
        
        let enriched: any = {
            ...propertyData,
            address: normalizeAddress(propertyData.address) || propertyData.address,
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
        };

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

        // Handle company contact lookup/creation/update
        // Get property's county for county tracking (skip if "UNKNOWN")
        const propertyCounty = enriched.county && enriched.county !== "UNKNOWN" ? enriched.county : null;
        
        // Check if companyId was provided directly (from frontend when selecting from search)
        // Also check propertyOwnerId for backward compatibility
        let companyContactId: string | null = null;
        
        // Get the company ID from the form data (companyId takes priority over legacy propertyOwnerId)
        const formCompanyId = (propertyDataWithCompany as any).companyId || propertyDataWithCompany.propertyOwnerId;
        
        // If companyId/propertyOwnerId is provided directly, use it (user selected from search)
        if (formCompanyId && typeof formCompanyId === 'string') {
            // Verify the company exists
            const [contactById] = await db
                .select()
                .from(companies)
                .where(eq(companies.id, formCompanyId))
                .limit(1);
            
            if (contactById) {
                companyContactId = contactById.id;
                
                // Check if contact info needs updating (user may have modified name/email)
                const contactNameChanged = formProvidedContactName && 
                    propertyDataWithCompany.companyContactName && 
                    contactById.contactName !== propertyDataWithCompany.companyContactName.trim();
                
                const contactEmailChanged = formProvidedContactEmail && 
                    propertyDataWithCompany.companyContactEmail && 
                    contactById.contactEmail !== propertyDataWithCompany.companyContactEmail.trim();
                
                // Update counties if we have a valid county
                let updateFields: any = {
                    updatedAt: new Date(),
                };
                
                if (propertyCounty) {
                    try {
                        // Handle counties - new schema uses JSON type, so it's already an array
                        let countiesArray: string[] = [];
                        if (contactById.counties) {
                            if (Array.isArray(contactById.counties)) {
                                countiesArray = contactById.counties;
                            } else if (typeof contactById.counties === 'string') {
                                // Legacy: handle string format if still present
                                try {
                                    countiesArray = JSON.parse(contactById.counties);
                                } catch (parseError) {
                                    console.warn(`Failed to parse counties JSON for ${contactById.companyName}, starting fresh`);
                                    countiesArray = [];
                                }
                            }
                        }
                        
                        // Check if county is already in the array (case-insensitive)
                        const countyLower = propertyCounty.toLowerCase();
                        const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                        
                        if (!countyExists) {
                            // Add the new county to the array
                            countiesArray.push(propertyCounty);
                            updateFields.counties = countiesArray; // Drizzle will serialize JSON automatically
                            console.log(`Adding new county ${propertyCounty} to company contact ${contactById.companyName}`);
                        }
                    } catch (updateError: any) {
                        console.error(`Error updating counties for company contact ${contactById.companyName}:`, updateError);
                    }
                }
                
                if (contactNameChanged && propertyDataWithCompany.companyContactName) {
                    updateFields.contactName = propertyDataWithCompany.companyContactName.trim();
                }
                
                if (contactEmailChanged && propertyDataWithCompany.companyContactEmail) {
                    updateFields.contactEmail = propertyDataWithCompany.companyContactEmail.trim();
                }
                
                // Only update if there are fields to update
                if (updateFields.counties || contactNameChanged || contactEmailChanged) {
                    await db
                        .update(companies)
                        .set(updateFields)
                        .where(eq(companies.id, contactById.id));
                    
                    console.log(`Updated company contact: ${contactById.companyName} (ID: ${contactById.id})`);
                }
                
                console.log(`Using provided company contact ID: ${contactById.companyName} (ID: ${contactById.id})`);
            } else {
                console.warn(`Provided companyId ${formCompanyId} not found, will search by name instead`);
            }
        }
        
        // If no ID was provided or ID lookup failed, search by company name
        if (!companyContactId && propertyDataWithCompany.propertyOwner && propertyDataWithCompany.propertyOwner.trim() !== "") {
            // Normalize company name for storage
            const normalizedOwnerForStorage = normalizeCompanyNameForStorage(propertyDataWithCompany.propertyOwner);
            const normalizedOwnerForCompare = normalizeCompanyNameForComparison(normalizedOwnerForStorage || propertyDataWithCompany.propertyOwner);
            
            // Search for existing company using normalized comparison
            const allContacts = await db.select().from(companies);
            
            const existingContact = allContacts.find(c => {
                const normalizedContact = normalizeCompanyNameForComparison(c.companyName);
                return normalizedContact && normalizedContact === normalizedOwnerForCompare;
            });

            if (existingContact) {
                // Company exists - check if contact info needs updating
                companyContactId = existingContact.id;
                
                // Check if form provided values differ from DB values
                const contactNameChanged = formProvidedContactName && 
                    propertyDataWithCompany.companyContactName && 
                    existingContact.contactName !== propertyDataWithCompany.companyContactName.trim();
                
                const contactEmailChanged = formProvidedContactEmail && 
                    propertyDataWithCompany.companyContactEmail && 
                    existingContact.contactEmail !== propertyDataWithCompany.companyContactEmail.trim();
                
                // Update counties if we have a valid county
                let updateFields: any = {
                    updatedAt: new Date(),
                };
                
                if (propertyCounty) {
                    try {
                        // Handle counties - new schema uses JSON type, so it's already an array
                        let countiesArray: string[] = [];
                        if (existingContact.counties) {
                            if (Array.isArray(existingContact.counties)) {
                                countiesArray = existingContact.counties;
                            } else if (typeof existingContact.counties === 'string') {
                                // Legacy: handle string format if still present
                                try {
                                    countiesArray = JSON.parse(existingContact.counties);
                                } catch (parseError) {
                                    console.warn(`Failed to parse counties JSON for ${existingContact.companyName}, starting fresh`);
                                    countiesArray = [];
                                }
                            }
                        }
                        
                        // Check if county is already in the array (case-insensitive)
                        const countyLower = propertyCounty.toLowerCase();
                        const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                        
                        if (!countyExists) {
                            // Add the new county to the array
                            countiesArray.push(propertyCounty);
                            updateFields.counties = countiesArray; // Drizzle will serialize JSON automatically
                            console.log(`Adding new county ${propertyCounty} to company contact ${existingContact.companyName}`);
                        }
                    } catch (updateError: any) {
                        console.error(`Error updating counties for company contact ${existingContact.companyName}:`, updateError);
                    }
                }
                
                if (contactNameChanged && propertyDataWithCompany.companyContactName) {
                    updateFields.contactName = propertyDataWithCompany.companyContactName.trim();
                }
                
                if (contactEmailChanged && propertyDataWithCompany.companyContactEmail) {
                    updateFields.contactEmail = propertyDataWithCompany.companyContactEmail.trim();
                }
                
                // Only update if there are fields to update
                if (updateFields.counties || contactNameChanged || contactEmailChanged) {
                    await db
                        .update(companies)
                        .set(updateFields)
                        .where(eq(companies.id, existingContact.id));
                    
                    console.log(`Updated company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
                }
                
                console.log(`Using existing company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
            } else {
                // Company doesn't exist - create new company contact
                // Initialize counties array with the property's county if available
                const countiesArray = propertyCounty ? [propertyCounty] : [];
                
                const newContactData: any = {
                    companyName: normalizedOwnerForStorage || propertyDataWithCompany.propertyOwner,
                    contactName: formProvidedContactName && propertyDataWithCompany.companyContactName 
                        ? propertyDataWithCompany.companyContactName.trim() 
                        : null,
                    contactEmail: formProvidedContactEmail && propertyDataWithCompany.companyContactEmail 
                        ? propertyDataWithCompany.companyContactEmail.trim() 
                        : null,
                    counties: countiesArray, // Drizzle will serialize JSON automatically
                };
                
                const [newContact] = await db
                    .insert(companies)
                    .values(newContactData)
                    .returning();
                
                companyContactId = newContact.id;
                console.log(`Created new company contact: ${newContact.companyName} (ID: ${newContact.id}) with county: ${propertyCounty || 'none'}`);
            }
        }
        
        // Set companyId (more reliably filled than propertyOwnerId)
        enriched.companyId = companyContactId;
        
        // Remove legacy fields that are no longer used (they're in company_contacts table now)
        delete enriched.propertyOwner;
        delete enriched.companyContactName;
        delete enriched.companyContactEmail;

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
router.get("/map", MapsController.getMapData);

// Get property suggestions for search
router.get("/suggestions", async (req, res) => {
    try {
        const { search, county } = req.query;
        
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }

        const searchTerm = `%${search.toString().trim().toLowerCase()}%`;
        const conditions = [];

        // Add search conditions - use addresses table for address, city, state, zipCode
        conditions.push(
            or(
                sql`LOWER(TRIM(${addresses.formattedStreetAddress})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.city})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.state})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.zipCode})) LIKE ${searchTerm}`
            )
        );

        // Add county filter if provided - check both properties.county and addresses.county
        if (county) {
            const normalizedCounty = county.toString().trim().toLowerCase();
            conditions.push(
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                ) as any
            );
        }

        const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

        // Search all fields - no smart detection needed for suggestions
        // Join with addresses table to get address info
        let query = db
            .select({
                id: propertiesV2.id,
                address: addresses.formattedStreetAddress,
                city: addresses.city,
                state: addresses.state,
                zipcode: addresses.zipCode
            })
            .from(propertiesV2)
            .innerJoin(addresses, eq(propertiesV2.id, addresses.propertyId));

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
// @TODO: Update to use propertyOwnerId from properties table and update to store data with new fields
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
                        const allContacts = await db.select().from(companies);
                        
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
router.get("/streetview", StreetviewController.getStreetview);

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

        // Query the new normalized schema with joins
        // Join with addresses, structures, lastSales, and companies tables
        const [result] = await db
            .select({
                // Properties table fields
                id: propertiesV2.id,
                sfrPropertyId: propertiesV2.sfrPropertyId,
                companyId: propertiesV2.companyId,
                propertyOwnerId: propertiesV2.propertyOwnerId,
                propertyClassDescription: propertiesV2.propertyClassDescription,
                propertyType: propertiesV2.propertyType,
                vacant: propertiesV2.vacant,
                hoa: propertiesV2.hoa,
                ownerType: propertiesV2.ownerType,
                purchaseMethod: propertiesV2.purchaseMethod,
                listingStatus: propertiesV2.listingStatus,
                status: propertiesV2.status,
                monthsOwned: propertiesV2.monthsOwned,
                msa: propertiesV2.msa,
                county: propertiesV2.county,
                createdAt: propertiesV2.createdAt,
                updatedAt: propertiesV2.updatedAt,
                // Address fields
                address: addresses.formattedStreetAddress,
                city: addresses.city,
                state: addresses.state,
                zipCode: addresses.zipCode,
                latitude: sql<number | null>`CAST(${addresses.latitude} AS FLOAT)`,
                longitude: sql<number | null>`CAST(${addresses.longitude} AS FLOAT)`,
                // Structure fields
                bedrooms: structures.bedsCount,
                bathrooms: sql<number | null>`CAST(${structures.baths} AS FLOAT)`,
                squareFeet: structures.livingAreaSqft,
                yearBuilt: structures.yearBuilt,
                // Last sale fields (for price and dateSold)
                price: sql<number | null>`CAST(${lastSales.price} AS FLOAT)`,
                dateSold: lastSales.saleDate,
                // Company info from joined table
                companyName: companies.companyName,
                contactName: companies.contactName,
                contactEmail: companies.contactEmail,
            })
            .from(propertiesV2)
            .leftJoin(addresses, eq(propertiesV2.id, addresses.propertyId))
            .leftJoin(structures, eq(propertiesV2.id, structures.propertyId))
            .leftJoin(lastSales, eq(propertiesV2.id, lastSales.propertyId))
            .leftJoin(companies, eq(propertiesV2.companyId, companies.id)) // Join on companyId (more reliably filled)
            .where(eq(propertiesV2.id, id))
            .limit(1);

        if (!result) {
            return res.status(404).json({ message: "Property not found" });
        }

        // Map result to match the Property type expected by frontend
        // Parse decimal types and provide defaults
        const lat = result.latitude ? (typeof result.latitude === 'string' ? parseFloat(result.latitude) : Number(result.latitude)) : null;
        const lon = result.longitude ? (typeof result.longitude === 'string' ? parseFloat(result.longitude) : Number(result.longitude)) : null;
        const baths = result.bathrooms ? (typeof result.bathrooms === 'string' ? parseFloat(result.bathrooms) : Number(result.bathrooms)) : null;
        const price = result.price ? (typeof result.price === 'string' ? parseFloat(result.price) : Number(result.price)) : 0;

        const property = {
            id: String(result.id),
            // Address fields
            address: result.address || '',
            city: result.city || '',
            state: result.state || '',
            zipCode: result.zipCode || '',
            latitude: lat,
            longitude: lon,
            // Structure fields
            bedrooms: result.bedrooms ? Number(result.bedrooms) : 0,
            bathrooms: baths || 0,
            squareFeet: result.squareFeet ? Number(result.squareFeet) : 0,
            yearBuilt: result.yearBuilt ? Number(result.yearBuilt) : null,
            // Property fields
            propertyType: result.propertyType || '',
            status: result.status || 'in-renovation',
            // Price and date
            price: price,
            dateSold: result.dateSold ? (typeof result.dateSold === 'object' && result.dateSold !== null && 'toISOString' in result.dateSold ? (result.dateSold as Date).toISOString().split('T')[0] : (typeof result.dateSold === 'string' ? result.dateSold.split('T')[0] : String(result.dateSold))) : null,
            // Company info (using companyId, more reliably filled)
            companyId: result.companyId ? String(result.companyId) : null,
            companyName: result.companyName || null,
            companyContactName: result.contactName || null,
            companyContactEmail: result.contactEmail || null,
            // Legacy aliases for backward compatibility
            propertyOwner: result.companyName || null,
            propertyOwnerId: result.companyId ? String(result.companyId) : null, // Map to companyId for compatibility
            // Additional fields that might be expected
            description: null, // Not in new schema, set to null
            imageUrl: null, // Not in new schema, set to null
            // Legacy fields for backward compatibility
            purchasePrice: price,
            saleValue: price,
        };

        res.status(200).json(property);
    } catch (error) {
        console.error("Error fetching property:", error);
        res.status(500).json({ message: "Error fetching property" });
    }
});

// Update a single property by ID (requires admin auth)
// Only allows updating specific user-editable fields
router.patch("/:id", requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        // Validate request body
        const validation = updatePropertySchema.safeParse(req.body);
        
        if (!validation.success) {
            console.error("Validation errors:", validation.error.errors);
            return res.status(400).json({
                message: "Invalid update data",
                errors: validation.error.errors,
            });
        }

        const updateData = validation.data;

        // Check if property exists
        const [currentProperty] = await db
            .select()
            .from(properties)
            .where(eq(properties.id, id))
            .limit(1);

        if (!currentProperty) {
            return res.status(404).json({ 
                message: "Property not found" 
            });
        }

        // Build update object
        const updateFields: any = {};
        
        // Address (normalize with address normalization)
        if (updateData.address !== undefined) {
            updateFields.address = normalizeAddress(updateData.address) || updateData.address;
        }
        
        // City (normalize to title case)
        if (updateData.city !== undefined) {
            updateFields.city = normalizeToTitleCase(updateData.city) || updateData.city;
        }
        
        // State (uppercase)
        if (updateData.state !== undefined) {
            updateFields.state = updateData.state.toUpperCase().trim();
        }
        
        // Zip Code
        if (updateData.zipCode !== undefined) {
            updateFields.zipCode = updateData.zipCode.trim();
        }
        
        // Property Type
        if (updateData.propertyType !== undefined) {
            updateFields.propertyType = updateData.propertyType;
        }
        
        // Price (also updates saleValue and purchasePrice)
        if (updateData.price !== undefined) {
            updateFields.price = updateData.price;
            updateFields.saleValue = updateData.price;
            updateFields.purchasePrice = updateData.price;
        }
        
        // Bedrooms
        if (updateData.bedrooms !== undefined) {
            updateFields.bedrooms = updateData.bedrooms;
        }
        
        // Bathrooms
        if (updateData.bathrooms !== undefined) {
            updateFields.bathrooms = updateData.bathrooms;
        }
        
        // Date Sold
        if (updateData.dateSold !== undefined) {
            updateFields.dateSold = updateData.dateSold 
                ? updateData.dateSold.toISOString().split('T')[0]
                : null;
        }
        
        // Square Feet
        if (updateData.squareFeet !== undefined) {
            updateFields.squareFeet = updateData.squareFeet;
        }
        
        // Year Built
        if (updateData.yearBuilt !== undefined) {
            updateFields.yearBuilt = updateData.yearBuilt;
        }
        
        // Handle company contact lookup/creation/update
        // Check if form provided company contact info (before we normalize)
        const formProvidedContactName = updateData.companyContactName != null && 
            typeof updateData.companyContactName === 'string' && 
            updateData.companyContactName.trim() !== "";
        const formProvidedContactEmail = updateData.companyContactEmail != null && 
            typeof updateData.companyContactEmail === 'string' && 
            updateData.companyContactEmail.trim() !== "";
        
        // Check if companyId was provided directly (from frontend when selecting from search)
        // Also check propertyOwnerId for backward compatibility
        let companyContactId: string | null = null;
        
        // Get the company ID from the form data (companyId takes priority over legacy propertyOwnerId)
        const formCompanyId = (updateData as any).companyId || (updateData as any).propertyOwnerId;
        if (formCompanyId !== undefined && formCompanyId && typeof formCompanyId === 'string') {
            // Verify the company exists
            const [contactById] = await db
                .select()
                .from(companies)
                .where(eq(companies.id, formCompanyId))
                .limit(1);
            
            if (contactById) {
                companyContactId = contactById.id;
                
                // Check if company name was edited (normalize and compare)
                const normalizedNewName = updateData.propertyOwner 
                    ? normalizeCompanyNameForStorage(updateData.propertyOwner)
                    : null;
                const normalizedCurrentName = normalizeCompanyNameForStorage(contactById.companyName);
                const companyNameChanged = normalizedNewName && 
                    normalizedNewName !== normalizedCurrentName;
                
                // Check if contact info needs updating (user may have modified name/email)
                const contactNameChanged = formProvidedContactName && 
                    updateData.companyContactName && 
                    contactById.contactName !== updateData.companyContactName.trim();
                
                const contactEmailChanged = formProvidedContactEmail && 
                    updateData.companyContactEmail && 
                    contactById.contactEmail !== updateData.companyContactEmail.trim();
                
                if (companyNameChanged || contactNameChanged || contactEmailChanged) {
                    const contactUpdateFields: any = {
                        updatedAt: new Date(),
                    };
                    
                    // Update company name if it was changed (normalized)
                    if (companyNameChanged && normalizedNewName) {
                        contactUpdateFields.companyName = normalizedNewName;
                    }
                    
                    if (contactNameChanged && updateData.companyContactName) {
                        contactUpdateFields.contactName = updateData.companyContactName.trim();
                    }
                    
                    if (contactEmailChanged && updateData.companyContactEmail) {
                        contactUpdateFields.contactEmail = updateData.companyContactEmail.trim();
                    }
                    
                    await db
                        .update(companies)
                        .set(contactUpdateFields)
                        .where(eq(companies.id, contactById.id));
                    
                    console.log(`Updated company contact: ${contactById.companyName} (ID: ${contactById.id})`);
                }
                
                console.log(`Using provided company contact ID: ${contactById.companyName} (ID: ${contactById.id})`);
            } else {
                console.warn(`Provided companyId ${formCompanyId} not found, will search by name instead`);
            }
        }
        
        // If no ID was provided or ID lookup failed, search by company name
        if (!companyContactId && updateData.propertyOwner !== undefined) {
            if (updateData.propertyOwner && updateData.propertyOwner.trim() !== "") {
                // Normalize company name for storage
                const normalizedOwnerForStorage = normalizeCompanyNameForStorage(updateData.propertyOwner);
                const normalizedOwnerForCompare = normalizeCompanyNameForComparison(normalizedOwnerForStorage || updateData.propertyOwner);
                
                // Search for existing company using normalized comparison
                const allContacts = await db.select().from(companies);
                
                const existingContact = allContacts.find(c => {
                    const normalizedContact = normalizeCompanyNameForComparison(c.companyName);
                    return normalizedContact && normalizedContact === normalizedOwnerForCompare;
                });

                if (existingContact) {
                    // Company exists - check if contact info needs updating
                    companyContactId = existingContact.id;
                    
                    // Check if form provided values differ from DB values
                    const contactNameChanged = formProvidedContactName && 
                        updateData.companyContactName && 
                        existingContact.contactName !== updateData.companyContactName.trim();
                    
                    const contactEmailChanged = formProvidedContactEmail && 
                        updateData.companyContactEmail && 
                        existingContact.contactEmail !== updateData.companyContactEmail.trim();
                    
                    if (contactNameChanged || contactEmailChanged) {
                        // Update company contact with new info (only update fields that were provided and changed)
                        const contactUpdateFields: any = {
                            updatedAt: new Date(),
                        };
                        
                        if (contactNameChanged && updateData.companyContactName) {
                            contactUpdateFields.contactName = updateData.companyContactName.trim();
                        }
                        
                        if (contactEmailChanged && updateData.companyContactEmail) {
                            contactUpdateFields.contactEmail = updateData.companyContactEmail.trim();
                        }
                        
                        await db
                            .update(companies)
                            .set(contactUpdateFields)
                            .where(eq(companies.id, existingContact.id));
                        
                        console.log(`Updated company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
                    }
                    
                    console.log(`Using existing company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
                } else {
                    // Company doesn't exist - create new company contact
                    const newContactData: any = {
                        companyName: normalizedOwnerForStorage || updateData.propertyOwner,
                        contactName: formProvidedContactName && updateData.companyContactName 
                            ? updateData.companyContactName.trim() 
                            : null,
                        contactEmail: formProvidedContactEmail && updateData.companyContactEmail 
                            ? updateData.companyContactEmail.trim() 
                            : null,
                        counties: "[]", // Empty counties array for new contact
                    };
                    
                    const [newContact] = await db
                        .insert(companies)
                        .values(newContactData)
                        .returning();
                    
                    companyContactId = newContact.id;
                    console.log(`Created new company contact: ${newContact.companyName} (ID: ${newContact.id})`);
                }
            } else {
                // propertyOwner is being set to null/empty - clear the companyId
                companyContactId = null;
            }
        }
        
        // Set companyId (more reliably filled than propertyOwnerId)
        if (updateData.propertyOwner !== undefined || formCompanyId !== undefined) {
            updateFields.companyId = companyContactId;
        }
        
        // Description
        if (updateData.description !== undefined) {
            updateFields.description = updateData.description && typeof updateData.description === 'string' && updateData.description.trim() !== ""
                ? updateData.description.trim()
                : null;
        }

        // Check if zip code changed - if so, get county and MSA
        const zipCodeChanged = updateData.zipCode !== undefined && 
                               updateData.zipCode.trim() !== currentProperty.zipCode;
        
        if (zipCodeChanged) {
            const newZipCode = updateFields.zipCode || updateData.zipCode;
            
            // Get MSA from zip code
            const msa = getMSAFromZipCode(newZipCode);
            if (msa) {
                updateFields.msa = msa;
                console.log(`MSA determined from zip code ${newZipCode}: ${msa}`);
            } else {
                updateFields.msa = null;
                console.log(`Could not determine MSA for zip code: ${newZipCode}`);
            }
            
            // Get county from coordinates (if we have them) or we'll get it after geocoding
            // We'll handle county fetching after geocoding if needed
        }

        // Check if address fields changed - if so, geocode
        const addressChanged = updateData.address !== undefined || 
                               updateData.city !== undefined || 
                               updateData.state !== undefined || 
                               updateData.zipCode !== undefined;
        
        if (addressChanged) {
            // Use updated values if provided, otherwise use existing values
            const addressToGeocode = updateFields.address || currentProperty.address;
            const cityToGeocode = updateFields.city || currentProperty.city;
            const stateToGeocode = updateFields.state || currentProperty.state;
            const zipCodeToGeocode = updateFields.zipCode || currentProperty.zipCode;

            console.log(`Geocoding address: ${addressToGeocode}, ${cityToGeocode}, ${stateToGeocode} ${zipCodeToGeocode}`);
            const coords = await geocodeAddress(
                addressToGeocode,
                cityToGeocode,
                stateToGeocode,
                zipCodeToGeocode,
            );
            
            if (coords) {
                updateFields.latitude = coords.lat;
                updateFields.longitude = coords.lng;
                console.log(`Geocoded to: (${coords.lat}, ${coords.lng})`);
            } else {
                console.warn(`Geocoding unavailable for: ${addressToGeocode}. Coordinates will remain unchanged.`);
            }
        }

        // Get county from coordinates if we have coordinates (from geocoding above)
        const finalLatitude = updateFields.latitude !== undefined ? updateFields.latitude : currentProperty.latitude;
        const finalLongitude = updateFields.longitude !== undefined ? updateFields.longitude : currentProperty.longitude;
        
        if (addressChanged && finalLatitude && finalLongitude) {
            console.log(`Fetching county for coordinates: (${finalLongitude}, ${finalLatitude})`);
            const county = await fetchCounty(finalLongitude, finalLatitude);
            if (county) {
                updateFields.county = county;
                console.log(`County found: ${county}`);
            } else {
                // County not found - use "UNKNOWN" if current is also unknown
                if (!currentProperty.county || currentProperty.county === "UNKNOWN") {
                    updateFields.county = "UNKNOWN";
                    console.warn(`County not found for coordinates, using "UNKNOWN"`);
                }
            }
        }
        
        // Update company contact counties array if we have a company contact and a valid county
        // Get the final county value (either from updateFields if address changed, or currentProperty if not)
        // Also check if we have coordinates even if address didn't change (for new companies)
        let finalCounty: string | null = null;
        if (updateFields.county !== undefined) {
            finalCounty = updateFields.county;
        } else if (currentProperty.county) {
            finalCounty = currentProperty.county;
        } else if (finalLatitude && finalLongitude) {
            // If we have coordinates but no county yet, fetch it
            console.log(`Fetching county for coordinates: (${finalLongitude}, ${finalLatitude})`);
            const county = await fetchCounty(finalLongitude, finalLatitude);
            if (county) {
                finalCounty = county;
                updateFields.county = county;
                console.log(`County found: ${county}`);
            }
        }
        
        const propertyCounty = finalCounty && finalCounty !== "UNKNOWN" ? finalCounty : null;
        
        if (companyContactId && propertyCounty) {
            try {
                const [contact] = await db
                    .select()
                    .from(companies)
                    .where(eq(companies.id, companyContactId))
                    .limit(1);
                
                if (contact) {
                    // Handle counties - new schema uses JSON type, so it's already an array
                    let countiesArray: string[] = [];
                    if (contact.counties) {
                        if (Array.isArray(contact.counties)) {
                            countiesArray = contact.counties;
                        } else if (typeof contact.counties === 'string') {
                            // Legacy: handle string format if still present
                            try {
                                countiesArray = JSON.parse(contact.counties);
                            } catch (parseError) {
                                console.warn(`Failed to parse counties JSON for ${contact.companyName}, starting fresh`);
                                countiesArray = [];
                            }
                        }
                    }
                    
                    // Check if county is already in the array (case-insensitive)
                    const countyLower = propertyCounty.toLowerCase();
                    const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                    
                    if (!countyExists) {
                        // Add the new county to the array
                        countiesArray.push(propertyCounty);
                        // Update the contact in the database
                        await db
                            .update(companies)
                            .set({ 
                                counties: countiesArray, // Drizzle will serialize JSON automatically
                                updatedAt: new Date()
                            })
                            .where(eq(companies.id, companyContactId));
                        
                        console.log(`Updated company contact ${contact.companyName} with new county: ${propertyCounty}`);
                    }
                }
            } catch (updateError: any) {
                console.error(`Error updating counties for company contact:`, updateError);
            }
        }

        // Check if there are any fields to update
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ 
                message: "No fields provided to update" 
            });
        }

        // Always update the updatedAt timestamp
        updateFields.updatedAt = new Date();

        // Update the property
        const [updatedProperty] = await db
            .update(properties)
            .set(updateFields)
            .where(eq(properties.id, id))
            .returning();

        console.log(`Updated property: ${updatedProperty.address} (ID: ${id})`);

        res.json(updatedProperty);

    } catch (error) {
        console.error("Error updating property:", error);
        res.status(500).json({ 
            message: "Error updating property",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

export default router;