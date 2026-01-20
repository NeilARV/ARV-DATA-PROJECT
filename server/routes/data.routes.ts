import { Router } from "express";
import { db } from "server/storage";
import {
  properties,
  companyContacts,
  sfrSyncState,
} from "@shared/schema";
import {
  properties as propertiesV2,
  addresses,
  structures,
  assessments,
  exemptions,
  parcels,
  schoolDistricts,
  taxRecords,
  valuations,
  preForeclosures,
  lastSales,
  currentSales,
  propertyTransactions,
} from "../../database/schemas/properties.schema";
import { companies } from "../../database/schemas/companies.schema";
import { sfrSyncState as sfrSyncStateV2 } from "../../database/schemas/sync.schema";
import { eq, and, sql, or } from "drizzle-orm";
import { normalizeToTitleCase } from "server/utils/normalizeToTitleCase";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { mapPropertyType } from "server/utils/mapPropertyType";
import { fetchCounty } from "server/utils/fetchCounty";

const router = Router();

/* V2 SFR Sync Functions - Using new normalized schema and batch API */

// Helper to persist sync state V2 (tracking both lastSaleDate and lastRecordingDate)
async function persistSyncStateV2(options: {
    syncStateId?: number | null;
    previousLastSaleDate?: string | null;
    previousLastRecordingDate?: string | null;
    initialTotalSynced?: number;
    processed?: number;
    finalSaleDate?: string | null;
    finalRecordingDate?: string | null;
}) {
    const {
        syncStateId,
        previousLastSaleDate,
        previousLastRecordingDate,
        initialTotalSynced = 0,
        processed = 0,
        finalSaleDate,
        finalRecordingDate,
    } = options || {};

    if (!syncStateId) {
        console.warn("[SFR SYNC V2] No syncStateId provided to persist state");
        return { lastSaleDate: previousLastSaleDate || null, lastRecordingDate: previousLastRecordingDate || null };
    }

    const newTotalSynced = (initialTotalSynced || 0) + (processed || 0);
    
    // Calculate lastSaleDate (subtract 1 day because API range is non-inclusive)
    let saleDateToSet = finalSaleDate || previousLastSaleDate || null;
    if (saleDateToSet) {
        const date = new Date(saleDateToSet);
        date.setDate(date.getDate() - 1);
        saleDateToSet = date.toISOString().split("T")[0];
    }
    
    // Calculate lastRecordingDate (subtract 1 day because API range is non-inclusive)
    let recordingDateToSet = finalRecordingDate || previousLastRecordingDate || null;
    if (recordingDateToSet) {
        const date = new Date(recordingDateToSet);
        date.setDate(date.getDate() - 1);
        recordingDateToSet = date.toISOString().split("T")[0];
    }

    try {
        await db
            .update(sfrSyncStateV2)
            .set({
                lastSaleDate: saleDateToSet,
                lastRecordingDate: recordingDateToSet,
                totalRecordsSynced: newTotalSynced,
                lastSyncAt: sql`now()`,
            })
            .where(eq(sfrSyncStateV2.id, syncStateId));

        console.log(
            `[SFR SYNC V2] Persisted sync state. lastSaleDate: ${saleDateToSet}, lastRecordingDate: ${recordingDateToSet}, totalRecordsSynced: ${newTotalSynced}`,
        );
        return { lastSaleDate: saleDateToSet, lastRecordingDate: recordingDateToSet };
    } catch (e: any) {
        console.error("[SFR SYNC V2] Failed to persist sync state:", e);
        return { lastSaleDate: saleDateToSet, lastRecordingDate: recordingDateToSet };
    }
}

// Helper function to check if a name/entity is a trust
function isTrust(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
    if (!name) return false;
    
    // Ownership codes that indicate trusts
    const trustCodes = ['TR', 'FL']; // TR = Trust, FL = Family Living Trust
    
    if (ownershipCode && trustCodes.includes(ownershipCode.toUpperCase())) {
        return true;
    }
    
    // Name-based detection
    const trustPatterns = [
        /\bTRUST\b/i,
        /\bLIVING TRUST\b/i,
        /\bFAMILY TRUST\b/i,
        /\bREVOCABLE TRUST\b/i,
        /\bIRREVOCABLE TRUST\b/i,
        /\bSPOUSAL TRUST\b/i
    ];
    
    return trustPatterns.some(pattern => pattern.test(name));
}

// Helper function to check if a name/entity is a flipping company (corporate but not trust)
function isFlippingCompany(name: string | null | undefined, ownershipCode: string | null | undefined): boolean {
    if (!name) return false;
    
    // Must NOT be a trust
    if (isTrust(name, ownershipCode)) {
        return false;
    }
    
    // Valid corporate patterns
    const corporatePatterns = [
        /\bLLC\b/i,
        /\bINC\b/i,
        /\bCORP\b/i,
        /\bLTD\b/i,
        /\bLP\b/i,
        /\bPROPERTIES\b/i,
        /\bINVESTMENTS?\b/i,
        /\bCAPITAL\b/i,
        /\bVENTURES?\b/i,
        /\bHOLDINGS?\b/i,
        /\bREALTY\b/i
    ];
    
    return corporatePatterns.some(pattern => pattern.test(name));
}

// Sync function V2 for a single MSA using new API endpoints and normalized schema
async function syncMSAV2(msa: string, API_KEY: string, API_URL: string, today: string) {
    // Sync state / counters for this MSA
    let minDate: string = "";
    let syncStateId: number | null = null;
    let initialTotalSynced: number = 0;
    let syncState: any[] = [];

    // Track counters accessible in catch/finalize
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalContactsAdded = 0;
    let latestRecordingDate: string | null = null; // Track the most recent recordingDate from flips
    let earliestRecordingDate: string | null = null; // Track the earliest recordingDate (from last page) for sync state

    try {
        // Get or create sync state for this MSA
        syncState = await db
            .select()
            .from(sfrSyncStateV2)
            .where(eq(sfrSyncStateV2.msa, msa))
            .limit(1);

        if (syncState.length === 0) {
            // Create new sync state with default min date
            minDate = "2025-12-03"; // Default start date
            const [newSyncState] = await db
                .insert(sfrSyncStateV2)
                .values({
                    msa: msa,
                    lastSaleDate: null,
                    lastRecordingDate: null,
                    totalRecordsSynced: 0,
                })
                .returning();
            syncStateId = newSyncState.id;
            initialTotalSynced = 0;
        } else {
            // Use lastRecordingDate as min date (stored value is already recordingDate - 1, so use it directly)
            const lastRecording = syncState[0].lastRecordingDate;
            if (lastRecording) {
                minDate = new Date(lastRecording).toISOString().split("T")[0];
            } else {
                minDate = "2025-12-03"; // Default start date
            }
            syncStateId = syncState[0].id;
            initialTotalSynced = syncState[0].totalRecordsSynced || 0;
        }

        console.log(`[SFR SYNC V2] Starting sync for ${msa} from ${minDate} to ${today}`);

        // Load all company contacts into memory once
        const allContacts = await db.select().from(companies);
        const contactsMap = new Map<string, typeof allContacts[0]>();

        for (const contact of allContacts) {
            const normalizedKey = normalizeCompanyNameForComparison(contact.companyName);
            if (normalizedKey) {
                contactsMap.set(normalizedKey, contact);
            }
        }
        console.log(`[SFR SYNC V2] Loaded ${contactsMap.size} company contacts into cache`);

        // Collect addresses from /geo-analytics/flips (need addresses for /properties/batch)
        // Also store flip record data for status determination
        const addressesSet = new Set<string>();
        const flipsMap = new Map<string, any>(); // Map of address -> flip record
        
        // Fetch addresses from /geo-analytics/flips with pagination
        // Sort by -recording_date (descending) to start with furthest/most recent dates first
        console.log(`[SFR SYNC V2] Fetching addresses from /geo-analytics/flips with pagination`);
        
        let currentPage = 1;
        let shouldContinue = true;
        
        while (shouldContinue) {
            const flipsParams = new URLSearchParams({
                recording_date_min: minDate,
                recording_date_max: today,
                search_type: "msa",
                msa: msa,
                sort: "-recording_date", // Sort descending by recording_date (most recent first)
                page: currentPage.toString(), // Add page parameter for pagination
                page_size: "100",
            });
            // sale_price_min is optional, omit for now
            
            const flipsResponse = await fetch(`${API_URL}/geo-analytics/flips?${flipsParams.toString()}`, {
                method: 'GET',
                headers: {
                    'X-API-TOKEN': API_KEY,
                },
            });
            
            if (!flipsResponse.ok) {
                const errorText = await flipsResponse.text();
                throw new Error(`Geo analytics flips API error on page ${currentPage}: ${flipsResponse.status} - ${errorText}`);
            }
            
            const flipsData = await flipsResponse.json();
            
            // Check if we got empty data or non-array response
            if (!flipsData || !Array.isArray(flipsData) || flipsData.length === 0) {
                console.log(`[SFR SYNC V2] No more data on page ${currentPage} for ${msa}, stopping`);
                shouldContinue = false;
                break;
            }
            
            console.log(`[SFR SYNC V2] Fetched page ${currentPage} with ${flipsData.length} records from /geo-analytics/flips`);
            
            // Extract addresses and track recording dates
            // All records from /geo-analytics/flips are flip exits (sold properties)
            // Only add properties where sellerCorp is true (corporate seller/flipper)
            flipsData.forEach((record: any) => {
                // Only process if corporate seller (the flipper who sold the property)
                const sellerCorp = record.sellerCorp === true;
                if (!sellerCorp) {
                    return; // Skip non-corporate sellers
                }
                
                // Build address string: "ADDRESS, CITY, STATE"
                if (record.address && record.city && record.state) {
                    const addressStr = `${record.address}, ${record.city}, ${record.state}`;
                    addressesSet.add(addressStr);
                    
                    // Store flip record for later lookup (only store one per address - use latest if duplicates)
                    if (!flipsMap.has(addressStr) || 
                        (record.recordingDate && 
                         flipsMap.get(addressStr)?.recordingDate && 
                         record.recordingDate > flipsMap.get(addressStr)?.recordingDate)) {
                        flipsMap.set(addressStr, record);
                    }
                }
                
                // Track recording dates - we want the earliest date (since we're sorting descending)
                // The last page will have the earliest dates
                if (record.recordingDate) {
                    const recDateStr = typeof record.recordingDate === 'string' ? record.recordingDate.split("T")[0] : record.recordingDate.toISOString().split("T")[0];
                    
                    // Track latest recording date for this sync (most recent we've seen)
                    if (!latestRecordingDate || recDateStr > latestRecordingDate) {
                        latestRecordingDate = recDateStr;
                    }
                    
                    // Track earliest recording date (will be from the last page)
                    if (!earliestRecordingDate || recDateStr < earliestRecordingDate) {
                        earliestRecordingDate = recDateStr;
                    }
                }
            });
            
            // Check if we should continue to next page
            // If we got fewer records than expected, we've reached the end
            // (Assuming a standard page size - adjust if API has different behavior)
            if (flipsData.length < 100) {
                shouldContinue = false;
            } else {
                currentPage++;
            }
        }
        
        console.log(`[SFR SYNC V2] Completed pagination. Total addresses collected: ${addressesSet.size}, earliest recording date: ${earliestRecordingDate || 'N/A'}`);
        
        const addressesArray = Array.from(addressesSet);
        console.log(`[SFR SYNC V2] Collected ${addressesArray.length} unique addresses to process`);
        
        if (addressesArray.length === 0) {
            console.log(`[SFR SYNC V2] No properties to process for ${msa}`);
            return {
                success: true,
                msa,
                totalProcessed: 0,
                totalInserted: 0,
                totalUpdated: 0,
                totalContactsAdded: 0,
                dateRange: { from: minDate, to: today },
                lastRecordingDate: syncState.length > 0 ? syncState[0].lastRecordingDate : null,
            };
        }
        
        // Process properties in batches using /properties/batch (max 100 addresses per batch)
        const BATCH_SIZE = 100; // Max 100 addresses per batch
        for (let i = 0; i < addressesArray.length; i += BATCH_SIZE) {
            const batchAddresses = addressesArray.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(addressesArray.length / BATCH_SIZE);
            
            console.log(`[SFR SYNC V2] Processing batch ${batchNum}/${totalBatches} with ${batchAddresses.length} addresses`);
            
            // Fetch full property details from /properties/batch using pipe-separated addresses
            const addressesParam = batchAddresses.join('|');
            const batchResponse = await fetch(`${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`, {
                method: 'GET',
                headers: {
                    'X-API-TOKEN': API_KEY,
                },
            });
            
            if (!batchResponse.ok) {
                const errorText = await batchResponse.text();
                console.error(`[SFR SYNC V2] Batch API error on batch ${batchNum}:`, errorText);
                // Continue with next batch instead of failing completely
                continue;
            }
            
            const batchResponseData = await batchResponse.json();
            
            if (!batchResponseData || !Array.isArray(batchResponseData)) {
                console.warn(`[SFR SYNC V2] Invalid batch response format, skipping batch ${batchNum}`);
                continue;
            }
            
            // Process each property from the batch (response is array of { address, property } objects)
            for (const batchItem of batchResponseData) {
                // Skip items with errors or missing property data
                if (batchItem.error || !batchItem.property) {
                    if (batchItem.error) {
                        console.warn(`[SFR SYNC V2] Error for address ${batchItem.address}: ${batchItem.error}`);
                    }
                    continue;
                }
                
                const propertyData = batchItem.property;
                try {
                    totalProcessed++;
                    
                    // Extract property ID from API response (batch returns property.property_id)
                    const sfrPropertyId = propertyData.property_id;
                    if (!sfrPropertyId) {
                        console.warn(`[SFR SYNC V2] Skipping property without property_id`);
                        continue;
                    }
                    
                    // Note: recordingDate tracking is done from flips route data
                    
                    // Check if property exists
                    const [existingProperty] = await db
                        .select()
                        .from(propertiesV2)
                        .where(eq(propertiesV2.sfrPropertyId, Number(sfrPropertyId)))
                        .limit(1);
                    
                    // Get flip record for this address to determine status
                    const flipRecord = batchItem.address ? flipsMap.get(batchItem.address) : null;
                    
                    // Determine status and company based on new flip transaction logic
                    let status: string = "sold"; // Default
                    let listingStatus: string = "off_market"; // Default
                    let companyId: string | null = null;
                    let propertyOwnerId: string | null = null;
                    
                    // Get data from property batch response
                    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
                    const isCorporateOwner = propertyData.owner?.corporate_owner === true;
                    const ownerName = propertyData.owner?.name;
                    
                    // Get flip record data (we'll identify flipper below)
                    const isBase1YearExitedFlip = flipRecord?.isBase1YearExitedFlip === true;
                    
                    // Helper function to upsert company (only if not a trust)
                    const upsertCompany = async (
                        companyName: string
                    ): Promise<string | null> => {
                        const normalizedCompanyNameForStorage = normalizeCompanyNameForStorage(companyName);
                        if (!normalizedCompanyNameForStorage) {
                            return null;
                        }
                        
                        const normalizedCompanyNameForCompare = normalizeCompanyNameForComparison(normalizedCompanyNameForStorage);
                        const existingCompany = normalizedCompanyNameForCompare ? contactsMap.get(normalizedCompanyNameForCompare) : null;
                        
                        if (existingCompany) {
                            return existingCompany.id;
                        }
                        
                        // Create new company
                        try {
                            const county = propertyData.county || null;
                            const countiesArray = county ? [county] : [];
                            const countiesJson = JSON.stringify(countiesArray);
                            
                            const [newCompany] = await db
                                .insert(companies)
                                .values({
                                    companyName: normalizedCompanyNameForStorage,
                                    contactName: null,
                                    contactEmail: propertyData.owner?.contact_email || null,
                                    phoneNumber: propertyData.owner?.phone || null,
                                    counties: countiesJson,
                                    updatedAt: new Date(),
                                })
                                .returning();
                            
                            // Update cache
                            if (normalizedCompanyNameForCompare) {
                                contactsMap.set(normalizedCompanyNameForCompare, newCompany);
                            }
                            
                            return newCompany.id;
                        } catch (companyError: any) {
                            // Ignore duplicate key errors
                            if (!companyError?.message?.includes("duplicate") && !companyError?.code?.includes("23505")) {
                                console.error(`[SFR SYNC V2] Error creating company:`, companyError);
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
                    
                    // NEW FLIP TRANSACTION PROCESSING LOGIC
                    // All properties from /geo-analytics/flips are flip exits = "sold" status
                    
                    // Must have a flip record (since all properties come from /geo-analytics/flips)
                    if (!flipRecord) {
                        console.log(`[SFR SYNC V2] Skipping property with no flip record: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // STEP 1: Skip new construction transactions
                    const transactionType = flipRecord.transactionType;
                    const isNewConstruction = flipRecord.isNewConstruction === true;
                    
                    if ((transactionType && transactionType.toLowerCase() === "new construction") || isNewConstruction) {
                        console.log(`[SFR SYNC V2] Skipping new construction transaction: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // STEP 2: Check if sellerCorp is true
                    const sellerCorp = flipRecord.sellerCorp === true;
                    if (!sellerCorp) {
                        console.log(`[SFR SYNC V2] Skipping property with non-corporate seller: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // STEP 3: Get prevBuyer and validate it's a corporate entity
                    const prevBuyer = flipRecord.prevBuyer;
                    const flipperOwnershipCode = flipRecord.buyerOwnershipCode;
                    
                    if (!prevBuyer) {
                        console.log(`[SFR SYNC V2] Skipping property with no prevBuyer: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // Check if prevBuyer is a trust - skip if trust
                    if (isTrust(prevBuyer, flipperOwnershipCode)) {
                        console.log(`[SFR SYNC V2] Skipping property with trust as prevBuyer: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // Check if prevBuyer is a valid corporate entity
                    // Exception: "Opendoor" is a company even without corporate indicators
                    const isOpendoor = prevBuyer.toLowerCase().includes("opendoor");
                    const isCorporateEntity = isOpendoor || isFlippingCompany(prevBuyer, flipperOwnershipCode);
                    
                    if (!isCorporateEntity) {
                        console.log(`[SFR SYNC V2] Skipping property with non-corporate prevBuyer: ${batchItem.address} (prevBuyer: ${prevBuyer})`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // STEP 4: Add prevBuyer (flipper) to companies table
                    let flipperCompanyId: string | null = null;
                    flipperCompanyId = await upsertCompany(prevBuyer);
                    if (flipperCompanyId) totalContactsAdded++;
                    
                    // STEP 5: Ensure we have a companyId
                    if (!flipperCompanyId) {
                        console.log(`[SFR SYNC V2] Failed to create/get flipper company for: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // STEP 6: All properties from /geo-analytics/flips are flip exits
                    // Status = "sold", listing_status = "off-market"
                    status = "sold";
                    listingStatus = "off_market";
                    companyId = flipperCompanyId; // Flipper company for history
                    propertyOwnerId = null; // Sold to end buyer, we don't track individuals
                    // Note: We don't add buyers to companies since these are exits
                    
                    // Insert/update all related data (neon-http doesn't support transactions, so we do direct operations)
                    if (existingProperty) {
                        // Update existing property
                        await db
                            .update(propertiesV2)
                                .set({
                                    companyId: companyId,
                                    propertyOwnerId: propertyOwnerId,
                                    propertyClassDescription: propertyData.property_class_description || null,
                                    propertyType: propertyData.property_type || null,
                                    vacant: propertyData.vacant || null,
                                    hoa: propertyData.hoa || null,
                                    ownerType: propertyData.owner_type || null,
                                    purchaseMethod: propertyData.purchase_method || null,
                                    listingStatus: listingStatus,
                                    status: status,
                                    monthsOwned: propertyData.months_owned || null,
                                    msa: propertyData.msa || msa || null,
                                    county: propertyData.county || null,
                                    updatedAt: sql`now()`,
                                })
                                .where(eq(propertiesV2.id, existingProperty.id));
                            
                            totalUpdated++;
                    } else {
                        // Insert new property
                        const [newProperty] = await db
                            .insert(propertiesV2)
                                .values({
                                    sfrPropertyId: Number(sfrPropertyId),
                                    companyId: companyId,
                                    propertyOwnerId: propertyOwnerId,
                                    propertyClassDescription: propertyData.property_class_description || null,
                                    propertyType: propertyData.property_type || null,
                                    vacant: propertyData.vacant || null,
                                    hoa: propertyData.hoa || null,
                                    ownerType: propertyData.owner_type || null,
                                    purchaseMethod: propertyData.purchase_method || null,
                                    listingStatus: listingStatus,
                                    status: status,
                                    monthsOwned: propertyData.months_owned || null,
                                    msa: propertyData.msa || msa || null,
                                    county: propertyData.county || null,
                                })
                                .returning();
                            
                            const propertyId = newProperty.id;
                            
                        // Insert address
                        if (propertyData.address) {
                            await db.insert(addresses).values({
                                    propertyId: propertyId,
                                    formattedStreetAddress: propertyData.address.formatted_street_address || null,
                                    streetNumber: propertyData.address.street_number || null,
                                    streetSuffix: propertyData.address.street_suffix || null,
                                    streetPreDirection: propertyData.address.street_pre_direction || null,
                                    streetName: propertyData.address.street_name || null,
                                    streetPostDirection: propertyData.address.street_post_direction || null,
                                    unitType: propertyData.address.unit_type || null,
                                    unitNumber: propertyData.address.unit_number || null,
                                    city: propertyData.address.city || null,
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
                                    subdivision: propertyData.parcel.subdivision || null,
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
                                    schoolTaxDistrict1: propertyData.school_tax_district_1 || null,
                                    schoolTaxDistrict2: propertyData.school_tax_district_2 || null,
                                    schoolTaxDistrict3: propertyData.school_tax_district_3 || null,
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
                                    price: lastSale.price ? String(lastSale.price) : null,
                                    documentType: lastSale.document_type || null,
                                    mtgAmount: lastSale.mtg_amount ? String(lastSale.mtg_amount) : null,
                                    mtgType: lastSale.mtg_type || null,
                                    lender: lastSale.lender || null,
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
                                    buyer1: currentSale.buyer_1 || currentSale.buyer1 || null,
                                    buyer2: currentSale.buyer_2 || currentSale.buyer2 || null,
                                    seller1: currentSale.seller_1 || currentSale.seller1 || null,
                                    seller2: currentSale.seller_2 || currentSale.seller2 || null,
                                });
                            }
                            
                        totalInserted++;
                    }
                    
                    console.log(`[SFR SYNC V2] Processed property ${sfrPropertyId} (${existingProperty ? 'updated' : 'inserted'})`);
                    
                } catch (propertyError: any) {
                    console.error(`[SFR SYNC V2] Error processing property:`, propertyError);
                }
            }
            
            // Persist sync state periodically after batches
            // Use earliestRecordingDate if available (from pagination), otherwise use latestRecordingDate
            const recordingDateForSync = earliestRecordingDate || latestRecordingDate;
            if (recordingDateForSync && totalProcessed % 50 === 0) {
                try {
                    await persistSyncStateV2({
                        syncStateId,
                        previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                        previousLastRecordingDate: syncState.length > 0 ? syncState[0].lastRecordingDate : null,
                        initialTotalSynced,
                        processed: totalProcessed,
                        finalSaleDate: null, // Not tracking sale dates from flips
                        finalRecordingDate: recordingDateForSync,
                    });
                } catch (persistError) {
                    console.error(`[SFR SYNC V2] Failed to persist state after batch:`, persistError);
                }
            }
        }
        
        // Persist final sync state
        // Use earliestRecordingDate (from last page) minus 1 day for next sync
        // This ensures we resume from where we left off
        const recordingDateToStore = earliestRecordingDate || latestRecordingDate;
        const persistedState = await persistSyncStateV2({
            syncStateId: syncStateId,
            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            previousLastRecordingDate: syncState.length > 0 ? syncState[0].lastRecordingDate : null,
            initialTotalSynced: initialTotalSynced ?? 0,
            processed: totalProcessed ?? 0,
            finalSaleDate: null, // Not tracking sale dates from flips
            finalRecordingDate: recordingDateToStore ?? null,
        });
        
        console.log(`[SFR SYNC V2] Sync complete for ${msa}: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);
        
        return {
            success: true,
            msa,
            totalProcessed,
            totalInserted,
            totalUpdated,
            totalContactsAdded,
            dateRange: {
                from: minDate,
                to: latestRecordingDate || today
            },
            lastRecordingDate: persistedState.lastRecordingDate,
        };
        
    } catch (error) {
        console.error(`[SFR SYNC V2] Error syncing ${msa}:`, error);
        try {
            // Use earliestRecordingDate if available (from pagination), otherwise use latestRecordingDate
            const recordingDateForSync = earliestRecordingDate || latestRecordingDate;
            const persistedState = await persistSyncStateV2({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null,
                previousLastRecordingDate: syncState && syncState.length > 0 ? syncState[0].lastRecordingDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: totalProcessed ?? 0,
                finalSaleDate: null, // Not tracking sale dates from flips
                finalRecordingDate: recordingDateForSync ?? null,
            });
            console.log(`[SFR SYNC V2] Persisted sync state after failure for ${msa}. lastRecordingDate: ${persistedState.lastRecordingDate}`);
        } catch (e) {
            console.error(`[SFR SYNC V2] Failed to persist sync state after error for ${msa}:`, e);
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error syncing ${msa}: ${errorMessage}`);
    }
}

router.post("/v2/sfr", requireAdminAuth, async (req, res) => { 
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        // Fetch only the MSA with id = 1 (San Diego)
        const allSyncStates = await db
            .select()
            .from(sfrSyncStateV2)
            .where(eq(sfrSyncStateV2.id, 1));

        if (allSyncStates.length === 0) {
            return res.status(400).json({ 
                message: "MSA with id = 1 not found in sync state table.",
                error: "MSA not found"
            });
        }

        console.log(`[SFR SYNC V2] Found ${allSyncStates.length} MSA(s) to sync:`, allSyncStates.map(s => s.msa));

        // Sync each MSA sequentially
        const results = [];
        const errors = [];

        for (const syncState of allSyncStates) {
            try {
                console.log(`[SFR SYNC V2] Starting sync for MSA: ${syncState.msa}`);
                const result = await syncMSAV2(syncState.msa, API_KEY, API_URL, today);
                results.push(result);
                console.log(`[SFR SYNC V2] Completed sync for MSA: ${syncState.msa}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[SFR SYNC V2] Failed to sync MSA ${syncState.msa}:`, errorMessage);
                errors.push({
                    msa: syncState.msa,
                    error: errorMessage
                });
            }
        }

        // Calculate totals across all MSAs
        const totalProcessed = results.reduce((sum, r) => sum + r.totalProcessed, 0);
        const totalInserted = results.reduce((sum, r) => sum + r.totalInserted, 0);
        const totalUpdated = results.reduce((sum, r) => sum + r.totalUpdated, 0);
        const totalContactsAdded = results.reduce((sum, r) => sum + r.totalContactsAdded, 0);

        console.log(`[SFR SYNC V2] All syncs complete. Total: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);

        return res.status(200).json({
            success: true,
            totalProcessed,
            totalInserted,
            totalUpdated,
            totalContactsAdded,
            results,
            errors: errors.length > 0 ? errors : undefined,
        });
        
    } catch (error) {
        console.error("[SFR SYNC V2] Fatal error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ 
            message: "Error syncing SFR buyer data",
            error: errorMessage
        });
    }
});

export default router