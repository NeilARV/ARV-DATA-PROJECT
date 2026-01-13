import { Router } from "express";
import { db } from "server/storage";
import { properties, streetviewCache } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { insertPropertySchema, companyContacts, updatePropertySchema } from "@shared/schema";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { normalizeToTitleCase } from "server/utils/normalizeToTitleCase";
import { normalizeAddress } from "server/utils/normalizeAddress";
import { fetchCounty } from "server/utils/fetchCounty";
import { getMSAFromZipCode } from "server/utils/getMSAFromZipCode";
import { eq, sql, or, and, desc, asc, gt, getTableColumns } from "drizzle-orm";
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
            propertyOwnerId,
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

        // Company/Property Owner filter
        // Priority: propertyOwnerId > company/propertyOwner (for backward compatibility)
        if (propertyOwnerId && typeof propertyOwnerId === 'string' && propertyOwnerId.trim() !== '') {
            // Direct ID filter - most efficient and reliable
            conditions.push(
                eq(properties.propertyOwnerId, propertyOwnerId.trim())
            );
        } else {
            // Fallback to name-based filter (for backward compatibility)
            const ownerFilter = company || propertyOwner;
            if (ownerFilter) {
                // Normalize the search term the same way company names are stored
                const normalizedSearchTerm = normalizeCompanyNameForComparison(ownerFilter.toString());
                if (normalizedSearchTerm) {
                    // Compare normalized versions: remove punctuation and normalize spaces
                    // We need to normalize the database value in SQL for comparison
                    conditions.push(
                        sql`LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${companyContacts.companyName}), '[,.\\;:]', '', 'g'), '\\s+', ' ', 'g')) = ${normalizedSearchTerm}`
                    )
                }
            }
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
        // Must include LEFT JOIN if company name filter is used (since WHERE clause references companyContacts)
        // propertyOwnerId filter doesn't need JOIN since it filters directly on properties.propertyOwnerId
        let countQuery = db.select({ count: sql<number>`count(*)` }).from(properties);
        const ownerFilter = company || propertyOwner;
        if (ownerFilter && !propertyOwnerId) {
            // If company name filter is used (and not ID filter), we need the JOIN for the WHERE clause to work
            countQuery = countQuery.leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id)) as any;
        }
        if (whereClause) {
            countQuery = countQuery.where(whereClause) as any;
        }
        const [totalResult] = await countQuery.execute();
        const total = Number(totalResult?.count || 0);

        // Get paginated results (fetch one extra to check if there are more pages)
        // Use LEFT JOIN to get company info from company_contacts table
        let query = db
            .select({
                // All property fields
                id: properties.id,
                address: properties.address,
                city: properties.city,
                state: properties.state,
                zipCode: properties.zipCode,
                county: properties.county,
                price: properties.price,
                bedrooms: properties.bedrooms,
                bathrooms: properties.bathrooms,
                squareFeet: properties.squareFeet,
                propertyType: properties.propertyType,
                imageUrl: properties.imageUrl,
                latitude: properties.latitude,
                longitude: properties.longitude,
                description: properties.description,
                yearBuilt: properties.yearBuilt,
                propertyOwnerId: properties.propertyOwnerId,
                purchasePrice: properties.purchasePrice,
                dateSold: properties.dateSold,
                status: properties.status,
                buyerName: properties.buyerName,
                buyerFormattedName: properties.buyerFormattedName,
                phone: properties.phone,
                isCorporate: properties.isCorporate,
                isCashBuyer: properties.isCashBuyer,
                isDiscountedPurchase: properties.isDiscountedPurchase,
                isPrivateLender: properties.isPrivateLender,
                buyerPropertiesCount: properties.buyerPropertiesCount,
                buyerTransactionsCount: properties.buyerTransactionsCount,
                sellerName: properties.sellerName,
                lenderName: properties.lenderName,
                exitValue: properties.exitValue,
                exitBuyerName: properties.exitBuyerName,
                profitLoss: properties.profitLoss,
                holdDays: properties.holdDays,
                saleValue: properties.saleValue,
                avmValue: properties.avmValue,
                loanAmount: properties.loanAmount,
                sfrPropertyId: properties.sfrPropertyId,
                sfrRecordId: properties.sfrRecordId,
                msa: properties.msa,
                recordingDate: properties.recordingDate,
                createdAt: properties.createdAt,
                updatedAt: properties.updatedAt,
                // Company info from joined table
                companyName: companyContacts.companyName,
                contactName: companyContacts.contactName,
                contactEmail: companyContacts.contactEmail,
            })
            .from(properties)
            .leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id));
        
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
        const rawPropertiesList = results.slice(0, limitNum);

        // Map results to use company info from joined table, fallback to legacy fields
        const propertiesList = rawPropertiesList.map((prop: any) => {
            // Use company info from joined table if available, otherwise use legacy fields
            const { companyName, contactName, contactEmail, ...rest } = prop;
            return {
                ...rest,
                propertyOwner: companyName || prop.propertyOwner || null,
                companyContactName: contactName || prop.companyContactName || null,
                companyContactEmail: contactEmail || prop.companyContactEmail || null,
            };
        });

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
        
        // Check if propertyOwnerId was provided directly (from frontend when selecting from search)
        let companyContactId: string | null = null;
        
        // If propertyOwnerId is provided directly, use it (user selected from search)
        if (propertyDataWithCompany.propertyOwnerId && typeof propertyDataWithCompany.propertyOwnerId === 'string') {
            // Verify the company contact exists
            const [contactById] = await db
                .select()
                .from(companyContacts)
                .where(eq(companyContacts.id, propertyDataWithCompany.propertyOwnerId))
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
                        // Parse existing counties JSON
                        let countiesArray: string[] = [];
                        if (contactById.counties) {
                            try {
                                countiesArray = JSON.parse(contactById.counties);
                            } catch (parseError) {
                                console.warn(`Failed to parse counties JSON for ${contactById.companyName}, starting fresh`);
                                countiesArray = [];
                            }
                        }
                        
                        // Check if county is already in the array (case-insensitive)
                        const countyLower = propertyCounty.toLowerCase();
                        const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                        
                        if (!countyExists) {
                            // Add the new county to the array
                            countiesArray.push(propertyCounty);
                            updateFields.counties = JSON.stringify(countiesArray);
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
                        .update(companyContacts)
                        .set(updateFields)
                        .where(eq(companyContacts.id, contactById.id));
                    
                    console.log(`Updated company contact: ${contactById.companyName} (ID: ${contactById.id})`);
                }
                
                console.log(`Using provided company contact ID: ${contactById.companyName} (ID: ${contactById.id})`);
            } else {
                console.warn(`Provided propertyOwnerId ${propertyDataWithCompany.propertyOwnerId} not found, will search by name instead`);
            }
        }
        
        // If no ID was provided or ID lookup failed, search by company name
        if (!companyContactId && propertyDataWithCompany.propertyOwner && propertyDataWithCompany.propertyOwner.trim() !== "") {
            // Normalize company name for storage
            const normalizedOwnerForStorage = normalizeCompanyNameForStorage(propertyDataWithCompany.propertyOwner);
            const normalizedOwnerForCompare = normalizeCompanyNameForComparison(normalizedOwnerForStorage || propertyDataWithCompany.propertyOwner);
            
            // Search for existing company contact using normalized comparison
            const allContacts = await db.select().from(companyContacts);
            
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
                        // Parse existing counties JSON
                        let countiesArray: string[] = [];
                        if (existingContact.counties) {
                            try {
                                countiesArray = JSON.parse(existingContact.counties);
                            } catch (parseError) {
                                console.warn(`Failed to parse counties JSON for ${existingContact.companyName}, starting fresh`);
                                countiesArray = [];
                            }
                        }
                        
                        // Check if county is already in the array (case-insensitive)
                        const countyLower = propertyCounty.toLowerCase();
                        const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                        
                        if (!countyExists) {
                            // Add the new county to the array
                            countiesArray.push(propertyCounty);
                            updateFields.counties = JSON.stringify(countiesArray);
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
                        .update(companyContacts)
                        .set(updateFields)
                        .where(eq(companyContacts.id, existingContact.id));
                    
                    console.log(`Updated company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
                }
                
                console.log(`Using existing company contact: ${existingContact.companyName} (ID: ${existingContact.id})`);
            } else {
                // Company doesn't exist - create new company contact
                // Initialize counties array with the property's county if available
                const countiesArray = propertyCounty ? [propertyCounty] : [];
                const countiesJson = JSON.stringify(countiesArray);
                
                const newContactData: any = {
                    companyName: normalizedOwnerForStorage || propertyDataWithCompany.propertyOwner,
                    contactName: formProvidedContactName && propertyDataWithCompany.companyContactName 
                        ? propertyDataWithCompany.companyContactName.trim() 
                        : null,
                    contactEmail: formProvidedContactEmail && propertyDataWithCompany.companyContactEmail 
                        ? propertyDataWithCompany.companyContactEmail.trim() 
                        : null,
                    counties: countiesJson,
                };
                
                const [newContact] = await db
                    .insert(companyContacts)
                    .values(newContactData)
                    .returning();
                
                companyContactId = newContact.id;
                console.log(`Created new company contact: ${newContact.companyName} (ID: ${newContact.id}) with county: ${propertyCounty || 'none'}`);
            }
        }
        
        // Set propertyOwnerId (not propertyOwner, companyContactName, companyContactEmail)
        enriched.propertyOwnerId = companyContactId;
        
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
        // Use LEFT JOIN to get company name from company_contacts table
        let query = db
            .select({
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
                // Company name from joined table
                companyName: companyContacts.companyName,
            })
            .from(properties)
            .leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id));

        if (whereClause) {
            query = query.where(whereClause) as any;
        }

        const rawResults = await query.execute();

        // Map results to use companyName as propertyOwner for backward compatibility
        const results = rawResults.map((prop: any) => {
            const { companyName, ...rest } = prop;
            return {
                ...rest,
                propertyOwner: companyName || null,
            };
        });

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

        // Use LEFT JOIN to get company info from company_contacts table
        // Select all fields from properties table and only companyName, contactName, contactEmail from company_contacts
        const [result] = await db
            .select({
                ...getTableColumns(properties),
                // Company info from joined table
                companyName: companyContacts.companyName,
                contactName: companyContacts.contactName,
                contactEmail: companyContacts.contactEmail,
            })
            .from(properties)
            .leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id))
            .where(eq(properties.id, id))
            .limit(1);

        if (!result) {
            return res.status(404).json({ message: "Property not found" });
        }

        // Map result to use company info from joined table, fallback to legacy fields
        const { companyName, contactName, contactEmail, ...rest } = result;
        const property = {
            ...rest,
            propertyOwner: companyName || null,
            companyContactName: contactName || null,
            companyContactEmail: contactEmail || null,
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
        
        // Check if propertyOwnerId was provided directly (from frontend when selecting from search)
        let companyContactId: string | null = null;
        
        // If propertyOwnerId is provided directly, use it (user selected from search)
        const providedPropertyOwnerId = (updateData as any).propertyOwnerId;
        if (providedPropertyOwnerId !== undefined && providedPropertyOwnerId && typeof providedPropertyOwnerId === 'string') {
            // Verify the company contact exists
            const [contactById] = await db
                .select()
                .from(companyContacts)
                .where(eq(companyContacts.id, providedPropertyOwnerId))
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
                        .update(companyContacts)
                        .set(contactUpdateFields)
                        .where(eq(companyContacts.id, contactById.id));
                    
                    console.log(`Updated company contact: ${contactById.companyName} (ID: ${contactById.id})`);
                }
                
                console.log(`Using provided company contact ID: ${contactById.companyName} (ID: ${contactById.id})`);
            } else {
                console.warn(`Provided propertyOwnerId ${providedPropertyOwnerId} not found, will search by name instead`);
            }
        }
        
        // If no ID was provided or ID lookup failed, search by company name
        if (!companyContactId && updateData.propertyOwner !== undefined) {
            if (updateData.propertyOwner && updateData.propertyOwner.trim() !== "") {
                // Normalize company name for storage
                const normalizedOwnerForStorage = normalizeCompanyNameForStorage(updateData.propertyOwner);
                const normalizedOwnerForCompare = normalizeCompanyNameForComparison(normalizedOwnerForStorage || updateData.propertyOwner);
                
                // Search for existing company contact using normalized comparison
                const allContacts = await db.select().from(companyContacts);
                
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
                            .update(companyContacts)
                            .set(contactUpdateFields)
                            .where(eq(companyContacts.id, existingContact.id));
                        
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
                        .insert(companyContacts)
                        .values(newContactData)
                        .returning();
                    
                    companyContactId = newContact.id;
                    console.log(`Created new company contact: ${newContact.companyName} (ID: ${newContact.id})`);
                }
            } else {
                // propertyOwner is being set to null/empty - clear the propertyOwnerId
                companyContactId = null;
            }
        }
        
        // Set propertyOwnerId (not propertyOwner, companyContactName, companyContactEmail)
        if (updateData.propertyOwner !== undefined || providedPropertyOwnerId !== undefined) {
            updateFields.propertyOwnerId = companyContactId;
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
                    .from(companyContacts)
                    .where(eq(companyContacts.id, companyContactId))
                    .limit(1);
                
                if (contact) {
                    // Parse existing counties JSON
                    let countiesArray: string[] = [];
                    if (contact.counties) {
                        try {
                            countiesArray = JSON.parse(contact.counties);
                        } catch (parseError) {
                            console.warn(`Failed to parse counties JSON for ${contact.companyName}, starting fresh`);
                            countiesArray = [];
                        }
                    }
                    
                    // Check if county is already in the array (case-insensitive)
                    const countyLower = propertyCounty.toLowerCase();
                    const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                    
                    if (!countyExists) {
                        // Add the new county to the array
                        countiesArray.push(propertyCounty);
                        const updatedCountiesJson = JSON.stringify(countiesArray);
                        
                        // Update the contact in the database
                        await db
                            .update(companyContacts)
                            .set({ 
                                counties: updatedCountiesJson,
                                updatedAt: new Date()
                            })
                            .where(eq(companyContacts.id, companyContactId));
                        
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