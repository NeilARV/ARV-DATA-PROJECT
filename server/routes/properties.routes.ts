import { Router } from "express";
import { db } from "server/storage";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { companies } from "../../database/schemas/companies.schema";
import { 
    properties, 
    addresses, 
    structures, 
    lastSales,
    propertyTransactions,
} from "../../database/schemas/properties.schema";
import { normalizeCountyName, normalizeCompanyNameForComparison, normalizeCompanyNameForStorage, normalizePropertyType, normalizeDateToYMD } from "server/utils/normalization";
import { insertPropertyRelatedData, SfrPropertyData } from "server/utils/propertyDataHelpers";
import { eq, sql, or, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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

        // Validate that we have the required address fields
        const { address, city, state, zipCode } = req.body;
        
        if (!address || !city || !state || !zipCode) {
            return res.status(400).json({
                message: "Missing required fields",
                errors: [
                    { path: [], message: "address, city, state, and zipCode are required" }
                ],
            });
        }

        // Format address for SFR API: "7612 HILLSIDE DR, LA JOLLA, CA 92037"
        const formattedAddress = `${address.toUpperCase()}, ${city.toUpperCase()}, ${state.toUpperCase()} ${zipCode}`;
        console.log(`Formatted address for SFR API: ${formattedAddress}`);

        // Get SFR API credentials
        const API_KEY = process.env.SFR_API_KEY;
        const API_URL = process.env.SFR_API_URL;

        if (!API_KEY || !API_URL) {
            return res.status(500).json({
                message: "SFR API not configured",
                error: "SFR_API_KEY and SFR_API_URL must be set"
            });
        }

        // Call SFR API /properties/by-address endpoint
        const sfrApiUrl = `${API_URL}/properties/by-address?address=${encodeURIComponent(formattedAddress)}`;
        console.log(`Calling SFR API: ${sfrApiUrl}`);
        
        const sfrResponse = await fetch(sfrApiUrl, {
            method: 'GET',
            headers: {
                'X-API-TOKEN': API_KEY,
            },
        });

        if (!sfrResponse.ok) {
            const errorText = await sfrResponse.text();
            console.error(`SFR API error: ${sfrResponse.status} - ${errorText}`);
            return res.status(sfrResponse.status).json({
                message: "Failed to fetch property from SFR API",
                error: errorText
            });
        }

        const propertyData = await sfrResponse.json();
        console.log("SFR API response received");

        if (!propertyData || !propertyData.property_id) {
            return res.status(404).json({
                message: "Property not found in SFR API",
                error: "No property data returned"
            });
        }

        // Extract property ID
        const sfrPropertyId = propertyData.property_id;
        
        // Check if property already exists
        const [existingProperty] = await db
            .select()
            .from(properties)
            .where(eq(properties.sfrPropertyId, Number(sfrPropertyId)))
            .limit(1);

        // Normalize county from API response (e.g., "San Diego County, California" -> "San Diego")
        const normalizedCounty = normalizeCountyName(propertyData.county);

        // Get buyer name from current_sale for company lookup
        const buyerName = propertyData.current_sale?.buyer_1 || propertyData.currentSale?.buyer1 || null;
        
        // Load all companies into memory for lookup
        const allCompanies = await db.select().from(companies);
        const contactsMap = new Map<string, typeof allCompanies[0]>();
        for (const company of allCompanies) {
            const normalizedKey = normalizeCompanyNameForComparison(company.companyName);
            if (normalizedKey) {
                contactsMap.set(normalizedKey, company);
            }
        }

        // Helper function to upsert company (similar to data.routes.ts)
        const upsertCompany = async (companyName: string, county: string | null): Promise<string | null> => {
            const normalizedCompanyNameForStorage = normalizeCompanyNameForStorage(companyName);
            if (!normalizedCompanyNameForStorage) {
                return null;
            }
            
            const normalizedCompanyNameForCompare = normalizeCompanyNameForComparison(normalizedCompanyNameForStorage);
            const existingCompany = normalizedCompanyNameForCompare ? contactsMap.get(normalizedCompanyNameForCompare) : null;
            
            if (existingCompany) {
                // Update company's counties array if we have a new county
                if (county) {
                    try {
                        let countiesArray: string[] = [];
                        if (existingCompany.counties) {
                            if (Array.isArray(existingCompany.counties)) {
                                countiesArray = existingCompany.counties;
                            } else if (typeof existingCompany.counties === 'string') {
                                try {
                                    countiesArray = JSON.parse(existingCompany.counties);
                                } catch (parseError) {
                                    countiesArray = [];
                                }
                            }
                        }
                        
                        const countyLower = county.toLowerCase();
                        const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                        
                        if (!countyExists) {
                            countiesArray.push(county);
                            await db
                                .update(companies)
                                .set({
                                    counties: countiesArray,
                                    updatedAt: new Date(),
                                })
                                .where(eq(companies.id, existingCompany.id));
                            
                            existingCompany.counties = countiesArray;
                            if (normalizedCompanyNameForCompare) {
                                contactsMap.set(normalizedCompanyNameForCompare, existingCompany);
                            }
                        }
                    } catch (updateError: any) {
                        console.error(`Error updating counties for company ${existingCompany.companyName}:`, updateError);
                    }
                }
                return existingCompany.id;
            }
            
            // Create new company
            try {
                const countiesArray = county ? [county] : [];
                const [newCompany] = await db
                    .insert(companies)
                    .values({
                        companyName: normalizedCompanyNameForStorage,
                        contactName: null,
                        contactEmail: propertyData.owner?.contact_email || null,
                        phoneNumber: propertyData.owner?.phone || null,
                        counties: countiesArray,
                        updatedAt: new Date(),
                    })
                    .returning();
                
                if (normalizedCompanyNameForCompare) {
                    contactsMap.set(normalizedCompanyNameForCompare, newCompany);
                }
                
                return newCompany.id;
            } catch (companyError: any) {
                if (!companyError?.message?.includes("duplicate") && !companyError?.code?.includes("23505")) {
                    console.error(`Error creating company:`, companyError);
                    return null;
                } else {
                    // Fetch existing company if duplicate
                    try {
                        const [duplicateCompany] = await db
                            .select()
                            .from(companies)
                            .where(eq(companies.companyName, normalizedCompanyNameForStorage))
                            .limit(1);
                        if (duplicateCompany) {
                            if (normalizedCompanyNameForCompare) {
                                contactsMap.set(normalizedCompanyNameForCompare, duplicateCompany);
                            }
                            return duplicateCompany.id;
                        }
                    } catch {}
                }
                return null;
            }
        };

        // Get buyer and seller company IDs from names
        let buyerId: string | null = null;
        let sellerId: string | null = null;
        const sellerName = propertyData.current_sale?.seller_1 || propertyData.currentSale?.seller1 || null;
        
        if (buyerName) {
            buyerId = await upsertCompany(buyerName, normalizedCounty);
        }
        if (sellerName) {
            sellerId = await upsertCompany(sellerName, normalizedCounty);
        }

        // Insert acquisition transaction if we have last_sale data (mirrors /api/data/sfr logic)
        const maybeInsertAcquisitionTransaction = async (
            propertyId: string,
            txBuyerId: string | null,
            data: typeof propertyData,
            buyerNameVal: string | null
        ) => {
            if (!txBuyerId || !buyerNameVal) return;
            const lastSale = data?.last_sale || data?.lastSale;
            if (!lastSale?.date) return;
            const normalizedDate = normalizeDateToYMD(lastSale.date);
            if (!normalizedDate) return;
            const normalizedBuyerName = normalizeCompanyNameForStorage(buyerNameVal);
            let sellerNameVal: string | null = null;
            const cs = data?.current_sale || data?.currentSale;
            if (cs) sellerNameVal = normalizeCompanyNameForStorage(cs.seller_1 || cs.seller1) || null;
            const notes = lastSale.document_type ? `Document Type: ${lastSale.document_type}` : null;
            const [existing] = await db
                .select({ propertyId: propertyTransactions.propertyId })
                .from(propertyTransactions)
                .where(
                    and(
                        eq(propertyTransactions.propertyId, propertyId),
                        eq(propertyTransactions.buyerId, txBuyerId),
                        eq(propertyTransactions.transactionDate, normalizedDate),
                        eq(propertyTransactions.transactionType, "acquisition")
                    )
                )
                .limit(1);
            if (existing) return;
            await db.insert(propertyTransactions).values({
                propertyId,
                buyerId: txBuyerId,
                sellerId: sellerId,
                transactionType: "acquisition",
                transactionDate: normalizedDate,
                salePrice: lastSale.price != null ? String(lastSale.price) : null,
                mtgType: lastSale.mtg_type || null,
                mtgAmount: lastSale.mtg_amount != null ? String(lastSale.mtg_amount) : null,
                buyerName: normalizedBuyerName,
                sellerName: sellerNameVal,
                notes,
            });
        };

        // Determine status and listing status
        // SFR API returns "On Market" or "Off Market"
        // Map listing_status to status:
        // - "On Market" → status = "on-market"
        // - "Off Market" → status = "in-renovation"
        const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
        let status: string;
        if (propertyListingStatus === "on market" || propertyListingStatus === "on_market") {
            status = "on-market";
        } else {
            // Default to "in-renovation" for "Off Market" or any other value
            status = "in-renovation";
        }
        // Store listingStatus as normalized value from API (on-market or off-market)
        const listingStatus = propertyListingStatus === "on market" || propertyListingStatus === "on_market" ? "on-market" : "off-market";

        // Insert/update property in normalized schema (similar to data.routes.ts)
        if (existingProperty) {
            // Update existing property
            await db
                .update(properties)
                .set({
                    buyerId,
                    sellerId,
                    propertyClassDescription: propertyData.property_class_description || null,
                    propertyType: normalizePropertyType(propertyData.property_type) || null,
                    vacant: propertyData.vacant || null,
                    hoa: propertyData.hoa || null,
                    ownerType: propertyData.owner_type || null,
                    purchaseMethod: propertyData.purchase_method || null,
                    listingStatus: listingStatus,
                    status: status,
                    monthsOwned: propertyData.months_owned || null,
                    msa: propertyData.msa || null,
                    county: normalizedCounty,
                    updatedAt: sql`now()`,
                })
                .where(eq(properties.id, existingProperty.id));
            
            await maybeInsertAcquisitionTransaction(existingProperty.id, buyerId, propertyData, buyerName);
            console.log(`Property updated: ${sfrPropertyId}`);
            res.json({ 
                message: "Property updated successfully",
                id: existingProperty.id,
                sfrPropertyId: Number(sfrPropertyId)
            });
        } else {
            // Insert new property
            const [newProperty] = await db
                .insert(properties)
                .values({
                    sfrPropertyId: Number(sfrPropertyId),
                    buyerId,
                    sellerId,
                    propertyClassDescription: propertyData.property_class_description || null,
                    propertyType: normalizePropertyType(propertyData.property_type) || null,
                    vacant: propertyData.vacant || null,
                    hoa: propertyData.hoa || null,
                    ownerType: propertyData.owner_type || null,
                    purchaseMethod: propertyData.purchase_method || null,
                    listingStatus: listingStatus,
                    status: status,
                    monthsOwned: propertyData.months_owned || null,
                    msa: propertyData.msa || null,
                    county: normalizedCounty,
                })
                .returning();
            
            const propertyId = newProperty.id;
            
            // Insert all property-related data using helper function
            await insertPropertyRelatedData(propertyId, propertyData as SfrPropertyData, normalizedCounty);
            await maybeInsertAcquisitionTransaction(propertyId, buyerId, propertyData, buyerName);
            console.log(`Property created: ${sfrPropertyId} (ID: ${propertyId})`);
            res.json({ 
                message: "Property created successfully",
                id: propertyId,
                sfrPropertyId: Number(sfrPropertyId)
            });
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
                id: properties.id,
                address: addresses.formattedStreetAddress,
                city: addresses.city,
                state: addresses.state,
                zipcode: addresses.zipCode
            })
            .from(properties)
            .innerJoin(addresses, eq(properties.id, addresses.propertyId));

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

// Proxy Street View image to keep API key secure on server
// Now with database caching to reduce Google API calls
router.get("/streetview", StreetviewController.getStreetview);

// Delete a single property by ID (requires admin auth)
// Cascades to delete all related data (addresses, structures, assessments, etc.)
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

        console.log(`[DELETE] Successfully deleted property: ${id} (SFR Property ID: ${deleted[0].sfrPropertyId})`);
        res.json({
            message: "Property deleted successfully",
            id: deleted[0].id,
            sfrPropertyId: deleted[0].sfrPropertyId,
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
        const buyerCompanies = alias(companies, "buyer_companies");
        const sellerCompanies = alias(companies, "seller_companies");
        const [result] = await db
            .select({
                // Properties table fields
                id: properties.id,
                sfrPropertyId: properties.sfrPropertyId,
                buyerId: properties.buyerId,
                sellerId: properties.sellerId,
                propertyClassDescription: properties.propertyClassDescription,
                propertyType: properties.propertyType,
                vacant: properties.vacant,
                hoa: properties.hoa,
                ownerType: properties.ownerType,
                purchaseMethod: properties.purchaseMethod,
                listingStatus: properties.listingStatus,
                status: properties.status,
                monthsOwned: properties.monthsOwned,
                msa: properties.msa,
                county: properties.county,
                createdAt: properties.createdAt,
                updatedAt: properties.updatedAt,
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
                // Buyer company info
                buyerCompanyName: buyerCompanies.companyName,
                buyerContactName: buyerCompanies.contactName,
                buyerContactEmail: buyerCompanies.contactEmail,
                // Seller company info
                sellerCompanyName: sellerCompanies.companyName,
                sellerContactName: sellerCompanies.contactName,
                sellerContactEmail: sellerCompanies.contactEmail,
            })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .leftJoin(structures, eq(properties.id, structures.propertyId))
            .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
            .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
            .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
            .where(eq(properties.id, id))
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
            // Buyer company info
            buyerId: result.buyerId ? String(result.buyerId) : null,
            buyerCompanyName: result.buyerCompanyName || null,
            buyerContactName: result.buyerContactName || null,
            buyerContactEmail: result.buyerContactEmail || null,
            // Seller company info
            sellerId: result.sellerId ? String(result.sellerId) : null,
            sellerCompanyName: result.sellerCompanyName || null,
            sellerContactName: result.sellerContactName || null,
            sellerContactEmail: result.sellerContactEmail || null,
            // Legacy aliases for backward compatibility (buyer as primary, seller as fallback)
            companyId: result.buyerId ? String(result.buyerId) : (result.sellerId ? String(result.sellerId) : null),
            companyName: result.buyerCompanyName || result.sellerCompanyName || null,
            companyContactName: result.buyerContactName || result.sellerContactName || null,
            companyContactEmail: result.buyerContactEmail || result.sellerContactEmail || null,
            propertyOwner: result.buyerCompanyName || result.sellerCompanyName || null,
            propertyOwnerId: result.buyerId ? String(result.buyerId) : (result.sellerId ? String(result.sellerId) : null),
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

export default router;