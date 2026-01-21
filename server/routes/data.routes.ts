import { Router } from "express";
import { db } from "server/storage";
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
import { normalizeToTitleCase, normalizeSubdivision } from "server/utils/normalizeToTitleCase";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { mapPropertyType } from "server/utils/mapPropertyType";
import { fetchCounty } from "server/utils/fetchCounty";
import { normalizeAddress } from "server/utils/normalizeAddress";
import { normalizePropertyType } from "server/utils/normalizePropertyType";

const router = Router();

/* V2 SFR Sync Functions - Using new normalized schema and batch API */

// Helper to persist sync state V2 (tracking only lastSaleDate)
async function persistSyncStateV2(options: {
    syncStateId?: number | null;
    previousLastSaleDate?: string | null;
    initialTotalSynced?: number;
    processed?: number;
    finalSaleDate?: string | null;
}) {
    const {
        syncStateId,
        previousLastSaleDate,
        initialTotalSynced = 0,
        processed = 0,
        finalSaleDate,
    } = options || {};

    if (!syncStateId) {
        console.warn("[SFR SYNC V2] No syncStateId provided to persist state");
        return { lastSaleDate: previousLastSaleDate || null };
    }

    const newTotalSynced = (initialTotalSynced || 0) + (processed || 0);
    
    // Calculate lastSaleDate
    // Subtract 1 day from the latest sale date because the API range is non-inclusive.
    let saleDateToSet: string | null = null;
    if (finalSaleDate) {
        // New boundary date found - normalize to YYYY-MM-DD and subtract 1 day
        if (typeof finalSaleDate === "string") {
            const date = new Date(finalSaleDate.split("T")[0]);
            if (!isNaN(date.getTime())) {
                date.setDate(date.getDate() - 1);
                saleDateToSet = date.toISOString().split("T")[0];
            } else {
                saleDateToSet = null;
            }
        } else {
            saleDateToSet = null;
        }
    } else if (previousLastSaleDate) {
        // No new date, keep the previous value
        saleDateToSet = typeof previousLastSaleDate === 'string' 
            ? previousLastSaleDate.split("T")[0] 
            : previousLastSaleDate;
    }

    try {
        await db
            .update(sfrSyncStateV2)
            .set({
                lastSaleDate: saleDateToSet,
                totalRecordsSynced: newTotalSynced,
                lastSyncAt: sql`now()`,
            })
            .where(eq(sfrSyncStateV2.id, syncStateId));

        console.log(
            `[SFR SYNC V2] Persisted sync state. lastSaleDate: ${saleDateToSet}, totalRecordsSynced: ${newTotalSynced}`,
        );
        return { lastSaleDate: saleDateToSet };
    } catch (e: any) {
        console.error("[SFR SYNC V2] Failed to persist sync state:", e);
        return { lastSaleDate: saleDateToSet };
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

// Helper function to fetch county from coordinates using our utility
async function getCountyFromCoordinates(latitude: number | string | null | undefined, longitude: number | string | null | undefined): Promise<string | null> {
    if (!latitude || !longitude) {
        return null;
    }
    
    try {
        const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
        const lon = typeof longitude === 'string' ? parseFloat(longitude) : longitude;
        
        if (isNaN(lat) || isNaN(lon)) {
            return null;
        }
        
        // fetchCounty already returns just the county name (BASENAME from Census API)
        const county = await fetchCounty(lon, lat);
        return county;
    } catch (error) {
        console.warn(`[SFR SYNC V2] Error fetching county from coordinates:`, error);
        return null;
    }
}

// Helper function to process a single property (used by both buyers/market and flips)
async function processProperty(
    propertyData: any,
    batchItem: any,
    record: any,
    contactsMap: Map<string, any>,
    existingProperty: any | null,
    msa: string,
    normalizedCounty: string | null
): Promise<{
    status: string;
    listingStatus: string;
    companyId: string | null;
    propertyOwnerId: string | null;
    shouldSkip: boolean;
    companyAdded: boolean;
}> {
    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
    
    // Helper function to upsert company
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
                    // Handle counties - new schema uses JSON type, so it's already an array
                    let countiesArray: string[] = [];
                    if (existingCompany.counties) {
                        if (Array.isArray(existingCompany.counties)) {
                            countiesArray = existingCompany.counties;
                        } else if (typeof existingCompany.counties === 'string') {
                            // Legacy: handle string format if still present
                            try {
                                countiesArray = JSON.parse(existingCompany.counties);
                            } catch (parseError) {
                                countiesArray = [];
                            }
                        }
                    }
                    
                    // Check if county is already in the array (case-insensitive)
                    const countyLower = county.toLowerCase();
                    const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                    
                    if (!countyExists) {
                        // Add the new county to the array
                        countiesArray.push(county);
                        await db
                            .update(companies)
                            .set({
                                counties: countiesArray,
                                updatedAt: new Date(),
                            })
                            .where(eq(companies.id, existingCompany.id));
                        
                        // Update the cached company object with the new counties array
                        existingCompany.counties = countiesArray;
                        if (normalizedCompanyNameForCompare) {
                            contactsMap.set(normalizedCompanyNameForCompare, existingCompany);
                        }
                    }
                } catch (updateError: any) {
                    console.error(`[SFR SYNC V2] Error updating counties for company ${existingCompany.companyName}:`, updateError);
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
                    counties: countiesArray, // Drizzle will serialize JSON automatically
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
                        // Update company's counties array if we have a new county
                        if (county) {
                            try {
                                // Handle counties - new schema uses JSON type, so it's already an array
                                let countiesArray: string[] = [];
                                if (duplicateCompany.counties) {
                                    if (Array.isArray(duplicateCompany.counties)) {
                                        countiesArray = duplicateCompany.counties;
                                    } else if (typeof duplicateCompany.counties === 'string') {
                                        // Legacy: handle string format if still present
                                        try {
                                            countiesArray = JSON.parse(duplicateCompany.counties);
                                        } catch (parseError) {
                                            countiesArray = [];
                                        }
                                    }
                                }
                                
                                // Check if county is already in the array (case-insensitive)
                                const countyLower = county.toLowerCase();
                                const countyExists = countiesArray.some(c => c.toLowerCase() === countyLower);
                                
                                if (!countyExists) {
                                    // Add the new county to the array
                                    countiesArray.push(county);
                                    await db
                                        .update(companies)
                                        .set({
                                            counties: countiesArray,
                                            updatedAt: new Date(),
                                        })
                                        .where(eq(companies.id, duplicateCompany.id));
                                    
                                    // Update the company object with the new counties array
                                    duplicateCompany.counties = countiesArray;
                                }
                            } catch (updateError: any) {
                                console.error(`[SFR SYNC V2] Error updating counties for duplicate company ${duplicateCompany.companyName}:`, updateError);
                            }
                        }
                        
                        // Update cache with the company (potentially with updated counties)
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
    
    // Only process /buyers/market records (flips endpoint removed)
    // Properties from /buyers/market are active flips = "in-renovation" status
    
    // Check if isCorporate is true
    const isCorporate = record.isCorporate === true;
    if (!isCorporate) {
        return { status: "", listingStatus: "", companyId: null, propertyOwnerId: null, shouldSkip: true, companyAdded: false };
    }
    
    // Get buyerName and validate it's a corporate entity
    const buyerName = record.buyerName;
    
    if (!buyerName) {
        return { status: "", listingStatus: "", companyId: null, propertyOwnerId: null, shouldSkip: true, companyAdded: false };
    }
    
    // Check if buyerName is a trust - skip if trust
    if (isTrust(buyerName, record.buyerOwnershipCode || null)) {
        return { status: "", listingStatus: "", companyId: null, propertyOwnerId: null, shouldSkip: true, companyAdded: false };
    }
    
    // Check if buyerName is a valid corporate entity
    // Exception: "Opendoor" is a company even without corporate indicators
    const isOpendoor = buyerName.toLowerCase().includes("opendoor");
    const isCorporateEntity = isOpendoor || isFlippingCompany(buyerName, record.buyerOwnershipCode || null);
    
    if (!isCorporateEntity) {
        return { status: "", listingStatus: "", companyId: null, propertyOwnerId: null, shouldSkip: true, companyAdded: false };
    }
    
    // Add buyerName (company) to companies table
    const buyerCompanyId = await upsertCompany(buyerName, normalizedCounty);
    
    if (!buyerCompanyId) {
        return { status: "", listingStatus: "", companyId: null, propertyOwnerId: null, shouldSkip: true, companyAdded: false };
    }
    
    // All properties from /buyers/market are active flips
    // Status = "in-renovation", listing_status based on property batch lookup
    const status = "in-renovation";
    const listingStatus = propertyListingStatus === "active" || propertyListingStatus === "pending" ? "on_market" : "off_market";
    const companyId = buyerCompanyId; // Buyer company
    const propertyOwnerId = buyerCompanyId; // Company owns the property (same as companyId)
    
    return { status, listingStatus, companyId, propertyOwnerId, shouldSkip: false, companyAdded: true };
}

// Sync function V2 for a single MSA using new API endpoints and normalized schema
// Only uses /buyers/market endpoint
async function syncMSAV2(msa: string, API_KEY: string, API_URL: string, today: string) {
    // Sync state / counters for this MSA
    let minSaleDate: string = "";
    let syncStateId: number | null = null;
    let initialTotalSynced: number = 0;
    let syncState: any[] = [];

    // Track counters accessible in catch/finalize
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalContactsAdded = 0;
    // Track boundary date for sync state persistence (latest saleDate we've seen in this run)
    let boundaryDate: string | null = null;

    try {
        // Get or create sync state for this MSA
        syncState = await db
            .select()
            .from(sfrSyncStateV2)
            .where(eq(sfrSyncStateV2.msa, msa))
            .limit(1);

        if (syncState.length === 0) {
            // Create new sync state with default min date
            minSaleDate = "2025-12-03"; // Default start date
            const [newSyncState] = await db
                .insert(sfrSyncStateV2)
                .values({
                    msa: msa,
                    lastSaleDate: null,
                    totalRecordsSynced: 0,
                })
                .returning();
            syncStateId = newSyncState.id;
            initialTotalSynced = 0;
        } else {
            // Use lastSaleDate as min sale date (stored value is already saleDate - 1, so use it directly)
            const lastSale = syncState[0].lastSaleDate;
            if (lastSale) {
                // Handle both Date objects and date strings (YYYY-MM-DD format)
                if (lastSale instanceof Date) {
                    minSaleDate = lastSale.toISOString().split("T")[0];
                } else if (typeof lastSale === 'string') {
                    // If it's already a date string, use it directly (may already be in YYYY-MM-DD format)
                    // If it has a timestamp, extract just the date part
                    minSaleDate = lastSale.split("T")[0];
                } else {
                    minSaleDate = "2025-12-03"; // Default start date
                }
            } else {
                minSaleDate = "2025-12-03"; // Default start date
            }
            
            syncStateId = syncState[0].id;
            initialTotalSynced = syncState[0].totalRecordsSynced || 0;
        }

        console.log(`[SFR SYNC V2] Starting sync for ${msa} from sale_date ${minSaleDate} to ${today}`);

        // Load all companies into memory once
        const allCompanies = await db.select().from(companies);
        const contactsMap = new Map<string, typeof allCompanies[0]>();

        for (const company of allCompanies) {
            const normalizedKey = normalizeCompanyNameForComparison(company.companyName);
            if (normalizedKey) {
                contactsMap.set(normalizedKey, company);
            }
        }
        console.log(`[SFR SYNC V2] Loaded ${contactsMap.size} companies into cache`);

        // ====================================================================
        // PROCESS /buyers/market (active flips)
        // ====================================================================
        console.log(`[SFR SYNC V2] ===== Processing /buyers/market =====`);
        
        const addressesSet = new Set<string>();
        const recordsMap = new Map<string, { record: any; recordingDate: string }>(); // Map of address -> record with recordingDate
        
        // Fetch addresses from /buyers/market with pagination
        let buyersMarketPage = 1;
        let buyersMarketShouldContinue = true;
        
        // We'll implement our own pagination using sale_date sorting.
        // Start from minSaleDate and keep advancing the boundary to the last sale_date
        // from each page until we receive < 100 records.
        let currentMinDate = minSaleDate;
        while (buyersMarketShouldContinue) {
            const buyersMarketParams = new URLSearchParams({
                msa: msa,
                sales_date_min: currentMinDate,
                sales_date_max: today,
                page_size: "100",
                // Ascending so the first item is the earliest and the last item is the furthest date
                sort: "sale_date",
            });
            
            const buyersMarketResponse = await fetch(`${API_URL}/buyers/market?${buyersMarketParams.toString()}`, {
                method: 'GET',
                headers: {
                    'X-API-TOKEN': API_KEY,
                },
            });
            
            if (!buyersMarketResponse.ok) {
                const errorText = await buyersMarketResponse.text();
                console.error(`[SFR SYNC V2] Buyers market API error on page ${buyersMarketPage}: ${buyersMarketResponse.status} - ${errorText}`);
                // Log error but don't fail - continue with flips
                buyersMarketShouldContinue = false;
                break;
            }
            
            const buyersMarketData = await buyersMarketResponse.json();
            
            // Check if we got empty data or non-array response
            if (!buyersMarketData || !Array.isArray(buyersMarketData) || buyersMarketData.length === 0) {
                console.log(`[SFR SYNC V2] No more data on page ${buyersMarketPage} for buyers/market, stopping`);
                buyersMarketShouldContinue = false;
                break;
            }
            
            console.log(`[SFR SYNC V2] Fetched page ${buyersMarketPage} (boundary from ${currentMinDate}) with ${buyersMarketData.length} records from /buyers/market`);
            
            // Extract addresses and track dates
            buyersMarketData.forEach((record: any) => {
                // Only process if isCorporate is true
                if (record.isCorporate !== true) {
                    return; // Skip non-corporate buyers
                }
                
                // Build address string: "ADDRESS, CITY, STATE"
                if (record.address && record.city && record.state) {
                    const addressStr = `${record.address}, ${record.city}, ${record.state}`;
                    const recordingDateStr = record.recordingDate ? 
                        (typeof record.recordingDate === 'string' ? record.recordingDate.split("T")[0] : record.recordingDate.toISOString().split("T")[0]) : "";
                    
                    // Check if we already have this address - keep the one with most recent recordingDate
                    const existingRecord = recordsMap.get(addressStr);
                    if (existingRecord) {
                        if (recordingDateStr && existingRecord.recordingDate && recordingDateStr > existingRecord.recordingDate) {
                            // This record is more recent, replace it
                            recordsMap.set(addressStr, { record, recordingDate: recordingDateStr });
                        }
                        // Otherwise keep existing (it's more recent or equal)
                    } else {
                        // New address, add it
                        addressesSet.add(addressStr);
                        recordsMap.set(addressStr, { record, recordingDate: recordingDateStr });
                    }
                }
                
            });

            // Determine the saleDate boundary for this page using the last item (array[-1] equivalent)
            const lastRecord = buyersMarketData[buyersMarketData.length - 1];
            const pageLastSaleDate = (lastRecord && lastRecord.saleDate)
                ? (typeof lastRecord.saleDate === "string"
                    ? lastRecord.saleDate.split("T")[0]
                    : lastRecord.saleDate.toISOString().split("T")[0])
                : null;
            // Track latest saleDate boundary for this run
            if (pageLastSaleDate && (!boundaryDate || pageLastSaleDate > boundaryDate)) {
                boundaryDate = pageLastSaleDate;
            }
            
            // If we got fewer than 100 records, we've reached the end of the range
            if (buyersMarketData.length < 100) {
                buyersMarketShouldContinue = false;
            } else {
                // Advance our date boundary for the next request using the page's last sale_date,
                // but only if we actually have one.
                if (pageLastSaleDate !== null) {
                    currentMinDate = pageLastSaleDate;
                }
            }

            // Persist sync state after each /buyers/market call using the latest saleDate boundary
            if (boundaryDate) {
                try {
                    await persistSyncStateV2({
                        syncStateId,
                        previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                        initialTotalSynced,
                        processed: 0, // don't change totalRecordsSynced here, just advance the date boundary
                        finalSaleDate: boundaryDate,
                    });
                } catch (persistPageError) {
                    console.error(`[SFR SYNC V2] Failed to persist state after buyers/market page:`, persistPageError);
                }
            }
        }
        
        console.log(`[SFR SYNC V2] Completed buyers/market pagination. Total addresses collected: ${addressesSet.size}, boundary date: ${boundaryDate || 'N/A'}`);
        
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
                dateRange: { from: minSaleDate, to: today },
                lastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            };
        }
        
        // ====================================================================
        // PROCESS PROPERTIES IN BATCHES (max 100 addresses per batch)
        // ====================================================================
        console.log(`[SFR SYNC V2] ===== Processing properties in batches =====`);
        
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
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // Check if property exists
                    const [existingProperty] = await db
                        .select()
                        .from(propertiesV2)
                        .where(eq(propertiesV2.sfrPropertyId, Number(sfrPropertyId)))
                        .limit(1);
                    
                    // Get record for this address (from buyers/market)
                    const recordInfo = batchItem.address ? recordsMap.get(batchItem.address) : null;
                    
                    if (!recordInfo) {
                        console.log(`[SFR SYNC V2] Skipping property with no record: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // Fetch county from coordinates using our utility function
                    // This ensures we get just the county name (e.g., "San Diego") not "San Diego County, California"
                    const normalizedCounty = await getCountyFromCoordinates(
                        propertyData.address?.latitude,
                        propertyData.address?.longitude
                    );
                    
                    // Process property using helper function
                    const processResult = await processProperty(
                        propertyData,
                        batchItem,
                        recordInfo.record,
                        contactsMap,
                        existingProperty,
                        msa,
                        normalizedCounty
                    );
                    
                    if (processResult.shouldSkip) {
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    if (processResult.companyAdded) {
                        totalContactsAdded++;
                    }
                    
                    const { status, listingStatus, companyId, propertyOwnerId } = processResult;
                    
                    // Insert/update all related data (neon-http doesn't support transactions, so we do direct operations)
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
                                    msa: propertyData.msa || msa || null,
                                    county: normalizedCounty,
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
                                    propertyType: normalizePropertyType(propertyData.property_type) || null,
                                    vacant: propertyData.vacant || null,
                                    hoa: propertyData.hoa || null,
                                    ownerType: propertyData.owner_type || null,
                                    purchaseMethod: propertyData.purchase_method || null,
                                    listingStatus: listingStatus,
                                    status: status,
                                    monthsOwned: propertyData.months_owned || null,
                                    msa: propertyData.msa || msa || null,
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

                            // recording_date is not provided by the batch property lookup, so we
                            // pull it from the original /buyers/market record for this property.
                            let recordingDateFromBuyersMarket: string | null = null;
                            if (recordInfo.record && recordInfo.record.recordingDate) {
                                recordingDateFromBuyersMarket =
                                    typeof recordInfo.record.recordingDate === "string"
                                        ? recordInfo.record.recordingDate.split("T")[0]
                                        : recordInfo.record.recordingDate.toISOString().split("T")[0];
                            }

                            await db.insert(lastSales).values({
                                    propertyId: propertyId,
                                    saleDate: lastSale.date || null,
                                    recordingDate: recordingDateFromBuyersMarket,
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
                            
                        totalInserted++;
                    }
                    
                    console.log(`[SFR SYNC V2] Processed property ${sfrPropertyId} (${existingProperty ? 'updated' : 'inserted'})`);
                    
                } catch (propertyError: any) {
                    console.error(`[SFR SYNC V2] Error processing property:`, propertyError);
                }
            }
            
            // Persist sync state periodically after batches
            if (boundaryDate && totalProcessed % 50 === 0) {
                try {
                    await persistSyncStateV2({
                        syncStateId,
                        previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                        initialTotalSynced,
                        processed: totalProcessed,
                        finalSaleDate: boundaryDate,
                    });
                } catch (persistError) {
                    console.error(`[SFR SYNC V2] Failed to persist state after batch:`, persistError);
                }
            }
        }
        
        // Persist final sync state
        // Use latest sale date minus 1 day for next sync (handled by persistSyncStateV2)
        // This ensures we resume from where we left off
        const persistedState = await persistSyncStateV2({
            syncStateId: syncStateId,
            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            initialTotalSynced: initialTotalSynced ?? 0,
            processed: totalProcessed ?? 0,
            finalSaleDate: boundaryDate ?? null,
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
                from: minSaleDate,
                to: boundaryDate || today
            },
            lastSaleDate: persistedState.lastSaleDate,
        };
        
    } catch (error) {
        console.error(`[SFR SYNC V2] Error syncing ${msa}:`, error);
        try {
            const persistedState = await persistSyncStateV2({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: totalProcessed ?? 0,
                finalSaleDate: boundaryDate ?? null,
            });
            console.log(`[SFR SYNC V2] Persisted sync state after failure for ${msa}. lastSaleDate: ${persistedState.lastSaleDate}`);
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
        // Fetch all MSAs from the sync state table
        const allSyncStates = await db
            .select()
            .from(sfrSyncStateV2);

        if (allSyncStates.length === 0) {
            return res.status(400).json({ 
                message: "No MSAs found in sync state table.",
                error: "No MSAs found"
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