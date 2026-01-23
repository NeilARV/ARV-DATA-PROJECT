import { Router } from "express";
import { db } from "server/storage";
import { properties } from "@shared/schema";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { companies } from "../../database/schemas/companies.schema";
import { 
    properties as propertiesV2, 
    addresses, 
    structures, 
    lastSales,
    currentSales,
    assessments,
    exemptions,
    parcels,
    schoolDistricts,
    taxRecords,
    valuations,
    preForeclosures
} from "../../database/schemas/properties.schema";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCountyName, normalizeToTitleCase, normalizeSubdivision, normalizeCompanyNameForComparison, normalizeCompanyNameForStorage, normalizePropertyType, normalizeAddress } from "server/utils/normalization";
import { eq, sql, or, and } from "drizzle-orm";
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
            .from(propertiesV2)
            .where(eq(propertiesV2.sfrPropertyId, Number(sfrPropertyId)))
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

        // Get company ID from buyer name
        let companyId: string | null = null;
        let propertyOwnerId: string | null = null;
        
        if (buyerName) {
            companyId = await upsertCompany(buyerName, normalizedCounty);
            propertyOwnerId = companyId;
        }

        // Determine status and listing status
        // SFR API returns "On Market" or "Off Market"; store as on-market/off-market
        const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
        const status = "in-renovation";
        const listingStatus = propertyListingStatus === "on market" || propertyListingStatus === "on_market" ? "on-market" : "off-market";

        // Insert/update property in normalized schema (similar to data.routes.ts)
        if (existingProperty) {
            // Update existing property
            await db
                .update(propertiesV2)
                .set({
                    companyId: companyId,
                    propertyOwnerId: propertyOwnerId,
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
                .where(eq(propertiesV2.id, existingProperty.id));
            
            console.log(`Property updated: ${sfrPropertyId}`);
            res.json({ 
                message: "Property updated successfully",
                id: existingProperty.id,
                sfrPropertyId: Number(sfrPropertyId)
            });
        } else {
            // Insert new property
            const [newProperty] = await db
                .insert(propertiesV2)
                .values({
                    sfrPropertyId: Number(sfrPropertyId),
                    companyId: companyId,
                    propertyOwnerId: propertyOwnerId,
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
            
            // Insert address
            if (propertyData.address) {
                await db.insert(addresses).values({
                    propertyId: propertyId,
                    formattedStreetAddress: normalizeAddress(propertyData.address.formatted_street_address) || null,
                    streetNumber: propertyData.address.street_number || null,
                    streetSuffix: propertyData.address.street_suffix || null,
                    streetPreDirection: propertyData.address.street_pre_direction || null,
                    streetName: normalizeToTitleCase(propertyData.address.street_name) || null,
                    streetPostDirection: propertyData.address.street_post_direction || null,
                    unitType: propertyData.address.unit_type || null,
                    unitNumber: propertyData.address.unit_number || null,
                    city: normalizeToTitleCase(propertyData.address.city) || null,
                    county: normalizedCounty,
                    state: propertyData.address.state || null,
                    zipCode: propertyData.address.zip_code || null,
                    zipPlusFourCode: propertyData.address.zip_plus_four_code || null,
                    carrierCode: propertyData.address.carrier_code || null,
                    latitude: propertyData.address.latitude ? String(propertyData.address.latitude) : null,
                    longitude: propertyData.address.longitude ? String(propertyData.address.longitude) : null,
                    geocodingAccuracy: propertyData.address.geocoding_accuracy || null,
                    censusTract: propertyData.address.census_tract || null,
                    censusBlock: propertyData.address.census_block || null,
                });
            }
            
            // Insert structure, assessments, exemptions, parcels, school districts, tax records, valuations, preForeclosures, lastSales, currentSales
            // (Similar to data.routes.ts - inserting all related data)
            
            // Insert structure
            if (propertyData.structure) {
                await db.insert(structures).values({
                    propertyId: propertyId,
                    totalAreaSqFt: propertyData.structure.total_area_sq_ft || null,
                    yearBuilt: propertyData.structure.year_built || null,
                    effectiveYearBuilt: propertyData.structure.effective_year_built || null,
                    bedsCount: propertyData.structure.beds_count || null,
                    roomsCount: propertyData.structure.rooms_count || null,
                    baths: propertyData.structure.baths ? String(propertyData.structure.baths) : null,
                    basementType: propertyData.structure.basement_type || null,
                    condition: propertyData.structure.condition || null,
                    constructionType: propertyData.structure.construction_type || null,
                    exteriorWallType: propertyData.structure.exterior_wall_type || null,
                    fireplaces: propertyData.structure.fireplaces || null,
                    heatingType: propertyData.structure.heating_type || null,
                    heatingFuelType: propertyData.structure.heating_fuel_type || null,
                    parkingSpacesCount: propertyData.structure.parking_spaces_count || null,
                    poolType: propertyData.structure.pool_type || null,
                    quality: propertyData.structure.quality || null,
                    roofMaterialType: propertyData.structure.roof_material_type || null,
                    roofStyleType: propertyData.structure.roof_style_type || null,
                    sewerType: propertyData.structure.sewer_type || null,
                    stories: propertyData.structure.stories || null,
                    unitsCount: propertyData.structure.units_count || null,
                    waterType: propertyData.structure.water_type || null,
                    livingAreaSqft: propertyData.structure.living_area_sqft || null,
                    acDescription: propertyData.structure.ac_description || null,
                    garageDescription: propertyData.structure.garage_description || null,
                    buildingClassDescription: propertyData.structure.building_class_description || null,
                    sqftDescription: propertyData.structure.sqft_description || null,
                });
            }
            
            // Insert assessment
            if (propertyData.assessments && propertyData.assessed_year) {
                await db.insert(assessments).values({
                    propertyId: propertyId,
                    assessedYear: propertyData.assessed_year,
                    landValue: propertyData.assessments.land_value ? String(propertyData.assessments.land_value) : null,
                    improvementValue: propertyData.assessments.improvement_value ? String(propertyData.assessments.improvement_value) : null,
                    assessedValue: propertyData.assessments.assessed_value ? String(propertyData.assessments.assessed_value) : null,
                    marketValue: propertyData.assessments.market_value ? String(propertyData.assessments.market_value) : null,
                });
            }
            
            // Insert exemption
            if (propertyData.exemptions) {
                await db.insert(exemptions).values({
                    propertyId: propertyId,
                    homeowner: propertyData.exemptions.homeowner || null,
                    veteran: propertyData.exemptions.veteran || null,
                    disabled: propertyData.exemptions.disabled || null,
                    widow: propertyData.exemptions.widow || null,
                    senior: propertyData.exemptions.senior || null,
                    school: propertyData.exemptions.school || null,
                    religious: propertyData.exemptions.religious || null,
                    welfare: propertyData.exemptions.welfare || null,
                    public: propertyData.exemptions.public || null,
                    cemetery: propertyData.exemptions.cemetery || null,
                    hospital: propertyData.exemptions.hospital || null,
                    library: propertyData.exemptions.library || null,
                });
            }
            
            // Insert parcel
            if (propertyData.parcel) {
                await db.insert(parcels).values({
                    propertyId: propertyId,
                    apnOriginal: propertyData.parcel.apn_original || null,
                    fipsCode: propertyData.parcel.fips_code || null,
                    frontageFt: propertyData.parcel.frontage_ft || null,
                    depthFt: propertyData.parcel.depth_ft || null,
                    areaAcres: propertyData.parcel.area_acres || null,
                    areaSqFt: propertyData.parcel.area_sq_ft || null,
                    zoning: propertyData.parcel.zoning || null,
                    countyLandUseCode: propertyData.parcel.county_land_use_code || null,
                    lotNumber: propertyData.parcel.lot_number || null,
                    subdivision: normalizeSubdivision(propertyData.parcel.subdivision) || null,
                    sectionTownshipRange: propertyData.parcel.section_township_range || null,
                    legalDescription: propertyData.parcel.legal_description || null,
                    stateLandUseCode: propertyData.parcel.state_land_use_code || null,
                    buildingCount: propertyData.parcel.building_count || null,
                });
            }
            
            // Insert school district
            if (propertyData.school_tax_district_1 || propertyData.school_district_name) {
                await db.insert(schoolDistricts).values({
                    propertyId: propertyId,
                    schoolTaxDistrict1: normalizeToTitleCase(propertyData.school_tax_district_1) || null,
                    schoolTaxDistrict2: normalizeToTitleCase(propertyData.school_tax_district_2) || null,
                    schoolTaxDistrict3: normalizeToTitleCase(propertyData.school_tax_district_3) || null,
                    schoolDistrictName: propertyData.school_district_name || null,
                });
            }
            
            // Insert tax record
            if (propertyData.tax_year) {
                await db.insert(taxRecords).values({
                    propertyId: propertyId,
                    taxYear: propertyData.tax_year,
                    taxAmount: propertyData.tax_amount ? String(propertyData.tax_amount) : null,
                    taxDelinquentYear: propertyData.tax_delinquent_year || null,
                    taxRateCodeArea: propertyData.tax_rate_code_area || null,
                });
            }
            
            // Insert valuation
            if (propertyData.valuation) {
                await db.insert(valuations).values({
                    propertyId: propertyId,
                    value: propertyData.valuation.value ? String(propertyData.valuation.value) : null,
                    high: propertyData.valuation.high ? String(propertyData.valuation.high) : null,
                    low: propertyData.valuation.low ? String(propertyData.valuation.low) : null,
                    forecastStandardDeviation: propertyData.valuation.forecast_standard_deviation ? String(propertyData.valuation.forecast_standard_deviation) : null,
                    valuationDate: propertyData.valuation.date || null,
                });
            }
            
            // Insert pre-foreclosure
            if (propertyData.pre_foreclosure) {
                await db.insert(preForeclosures).values({
                    propertyId: propertyId,
                    flag: propertyData.pre_foreclosure.flag || null,
                    ind: propertyData.pre_foreclosure.ind || null,
                    reason: propertyData.pre_foreclosure.reason || null,
                    docType: propertyData.pre_foreclosure.doc_type || null,
                    recordingDate: propertyData.pre_foreclosure.recording_date || null,
                });
            }
            
            // Insert last sale
            if (propertyData.last_sale || propertyData.lastSale) {
                const lastSale = propertyData.last_sale || propertyData.lastSale;
                await db.insert(lastSales).values({
                    propertyId: propertyId,
                    saleDate: lastSale.date || null,
                    recordingDate: lastSale.recording_date || null,
                    price: lastSale.price ? String(lastSale.price) : null,
                    documentType: lastSale.document_type || null,
                    mtgAmount: lastSale.mtg_amount ? String(lastSale.mtg_amount) : null,
                    mtgType: lastSale.mtg_type || null,
                    lender: normalizeCompanyNameForStorage(lastSale.lender) || null,
                    mtgInterestRate: lastSale.mtg_interest_rate || null,
                    mtgTermMonths: lastSale.mtg_term_months || null,
                });
            }
            
            // Insert current sale
            if (propertyData.current_sale || propertyData.currentSale) {
                const currentSale = propertyData.current_sale || propertyData.currentSale;
                await db.insert(currentSales).values({
                    propertyId: propertyId,
                    docNum: currentSale.doc_num || null,
                    buyer1: normalizeCompanyNameForStorage(currentSale.buyer_1 || currentSale.buyer1) || null,
                    buyer2: normalizeCompanyNameForStorage(currentSale.buyer_2 || currentSale.buyer2) || null,
                    seller1: normalizeCompanyNameForStorage(currentSale.seller_1 || currentSale.seller1) || null,
                    seller2: normalizeCompanyNameForStorage(currentSale.seller_2 || currentSale.seller2) || null,
                });
            }
            
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
// Cascades to delete all related data (addresses, structures, assessments, etc.)
router.delete("/:id", requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`[DELETE] Attempting to delete property ID: ${id}`);
        
        const deleted = await db
            .delete(propertiesV2)
            .where(eq(propertiesV2.id, id))
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

export default router;