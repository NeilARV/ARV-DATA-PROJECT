import { Router } from "express";
import { db } from "server/storage";
import {
  properties as propertiesV2,
  propertyTransactions,
} from "../../database/schemas/properties.schema";
import { companies } from "../../database/schemas/companies.schema";
import { sfrSyncState as sfrSyncStateV2 } from "../../database/schemas/sync.schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { normalizeDateToYMD, normalizeCountyName, normalizeCompanyNameForComparison, normalizeCompanyNameForStorage, normalizePropertyType, normalizeAddressForLookup } from "server/utils/normalization";
import { persistSyncState, isFlippingCompany, findAndCacheCompany, addCountiesToCompanyIfNeeded, getTransactionType } from "server/utils/dataSyncHelpers";
import { 
    createPropertyDataCollectors, 
    collectPropertyData, 
    batchInsertPropertyData,
    SfrPropertyData 
} from "server/utils/propertyDataHelpers";

const router = Router();

// Sync function for a single MSA using new API endpoints and normalized schema
// Only uses /buyers/market endpoint
export async function syncMSA(msa: string, cityCode: string, API_KEY: string, API_URL: string, today: string, excludedAddresses: string[] = []) {
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
            minSaleDate = normalizeDateToYMD(lastSale) || "2025-12-03";
            
            syncStateId = syncState[0].id;
            initialTotalSynced = syncState[0].totalRecordsSynced || 0;
        }

        console.log(`[${cityCode} SYNC] Starting sync for ${msa} from sale_date ${minSaleDate} to ${today}`);

        // Load all companies into memory once
        const allCompanies = await db.select().from(companies);
        const contactsMap = new Map<string, typeof allCompanies[0]>();

        for (const company of allCompanies) {
            const normalizedKey = normalizeCompanyNameForComparison(company.companyName);
            if (normalizedKey) {
                contactsMap.set(normalizedKey, company);
            }
        }
        console.log(`[${cityCode} SYNC] Loaded ${contactsMap.size} companies into cache`);

        // ====================================================================
        // PROCESS /buyers/market (active flips)
        // ====================================================================
        console.log(`[${cityCode} SYNC] ===== Processing /buyers/market =====`);
        
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
                console.error(`[${cityCode} SYNC] Buyers market API error on page ${buyersMarketPage}: ${buyersMarketResponse.status} - ${errorText}`);
                // Log error but don't fail - continue with flips
                buyersMarketShouldContinue = false;
                break;
            }
            
            const buyersMarketData = await buyersMarketResponse.json();
            
            // Check if we got empty data or non-array response
            if (!buyersMarketData || !Array.isArray(buyersMarketData) || buyersMarketData.length === 0) {
                console.log(`[${cityCode} SYNC] No more data on page ${buyersMarketPage} for buyers/market, stopping`);
                buyersMarketShouldContinue = false;
                break;
            }
            
            console.log(`[${cityCode} SYNC] Fetched page ${buyersMarketPage} (boundary from ${currentMinDate}) with ${buyersMarketData.length} records from /buyers/market`);
            
            // Extract addresses and track dates
            buyersMarketData.forEach((record: any) => {
                // Check if either buyer or seller is a corporation (not a trust)
                // Include: company buyer, company seller, or both. Exclude: individual/trust to individual/trust.
                // Trust counts as individual (not corporate) per isFlippingCompany.
                const buyerName = record.buyerName || "";
                const sellerName = record.sellerName || "";
                const buyerOwnershipCode = record.buyerOwnershipCode || null;
                
                const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
                const isSellerCorporate = isFlippingCompany(sellerName, null); // No ownership code for seller in this API
                
                // Skip if neither buyer nor seller is a corporation (excluding trusts)
                if (!isBuyerCorporate && !isSellerCorporate) {
                    return; // Skip - neither party is a corporate entity
                }
                
                // Build address string: "ADDRESS, CITY, STATE"
                if (record.address && record.city && record.state) {
                    const addressStr = `${record.address}, ${record.city}, ${record.state}`;
                    
                    // Check if this address should be excluded (case-insensitive match on street address)
                    const shouldExclude = excludedAddresses.some(excluded => {
                        const excludedLower = excluded.toLowerCase().trim();
                        const recordAddressLower = record.address.toLowerCase().trim();
                        // Match if the excluded address is contained in the record address (handles variations)
                        return recordAddressLower.includes(excludedLower) || excludedLower.includes(recordAddressLower);
                    });
                    
                    if (shouldExclude) {
                        console.log(`[${cityCode} SYNC] Skipping excluded address: ${addressStr}`);
                        return; // Skip this address
                    }
                    
                    const recordingDateStr = normalizeDateToYMD(record.recordingDate) || "";
                    
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
            const pageLastSaleDate = lastRecord ? normalizeDateToYMD(lastRecord.saleDate) : null;
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

            // NOTE: We intentionally do NOT persist sync state here during address collection.
            // We only persist after properties are actually saved to the database.
            // This ensures that if the batch processing fails, we can resume from the correct point.
        }
        
        console.log(`[${cityCode} SYNC] Completed buyers/market pagination. Total addresses collected: ${addressesSet.size}, boundary date: ${boundaryDate || 'N/A'}`);
        
        const addressesArray = Array.from(addressesSet);
        console.log(`[${cityCode} SYNC] Collected ${addressesArray.length} unique addresses to process`);
        
        if (addressesArray.length === 0) {
            console.log(`[${cityCode} SYNC] No properties to process for ${msa}`);
            
            // Still persist sync state even if no addresses found
            // This updates lastSyncAt and preserves boundaryDate if one was found
            const persistedState = await persistSyncState({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: 0,
                finalSaleDate: boundaryDate ?? null,
                cityCode,
            });
            
            return {
                success: true,
                msa,
                totalProcessed: 0,
                totalInserted: 0,
                totalUpdated: 0,
                totalContactsAdded: 0,
                dateRange: { from: minSaleDate, to: boundaryDate || today },
                lastSaleDate: persistedState.lastSaleDate,
            };
        }
        
        // ====================================================================
        // PROCESS PROPERTIES IN BATCHES (max 100 addresses per batch)
        // ====================================================================
        console.log(`[${cityCode} SYNC] ===== Processing properties in batches =====`);
        
        // Process properties in batches using /properties/batch (max 100 addresses per batch)
        const BATCH_SIZE = 100; // Max 100 addresses per batch
        for (let i = 0; i < addressesArray.length; i += BATCH_SIZE) {
            const batchAddresses = addressesArray.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(addressesArray.length / BATCH_SIZE);
            
            console.log(`[${cityCode} SYNC] Processing batch ${batchNum}/${totalBatches} with ${batchAddresses.length} addresses`);
            
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
                console.error(`[${cityCode} SYNC] Batch API error on batch ${batchNum}:`, errorText);
                // Continue with next batch instead of failing completely
                continue;
            }
            
            const batchResponseData = await batchResponse.json();
            
            if (!batchResponseData || !Array.isArray(batchResponseData)) {
                console.warn(`[${cityCode} SYNC] Invalid batch response format, skipping batch ${batchNum}`);
                continue;
            }
            
            // ====================================================================
            // STEP 1: COLLECT AND BATCH PROCESS COMPANIES
            // ====================================================================
            // Collect all valid properties and their company info
            interface ValidPropertyItem {
                batchItem: any;
                propertyData: any;
                recordInfo: { record: any; recordingDate: string } | null;
                sfrPropertyId: number;
                normalizedCounty: string | null;
            }

            const validProperties: ValidPropertyItem[] = [];
            const companyToCountiesMap = new Map<string, Set<string>>(); // normalizedCompanyName -> Set of counties

            // First pass: collect valid properties and companies
            for (const batchItem of batchResponseData) {
                // Skip items with errors or missing property data
                if (batchItem.error || !batchItem.property) {
                    if (batchItem.error) {
                        console.warn(`[${cityCode} SYNC] Error for address ${batchItem.address}: ${batchItem.error}`);
                    }
                    continue;
                }
                
                // Double-check: skip excluded addresses (safety check in case one slipped through)
                if (batchItem.address) {
                    const shouldExclude = excludedAddresses.some(excluded => {
                        const excludedLower = excluded.toLowerCase().trim();
                        const batchAddressLower = batchItem.address.toLowerCase().trim();
                        return batchAddressLower.includes(excludedLower) || excludedLower.includes(batchAddressLower);
                    });
                    
                    if (shouldExclude) {
                        console.log(`[${cityCode} SYNC] Skipping excluded address in batch: ${batchItem.address}`);
                        continue;
                    }
                }
                
                const propertyData = batchItem.property;
                const sfrPropertyId = propertyData.property_id;
                if (!sfrPropertyId) {
                    console.warn(`[${cityCode} SYNC] Skipping property without property_id`);
                    continue;
                }
                
                // Get record for this address (from buyers/market)
                // Batch API returns "STREET, CITY, STATE ZIP" but recordsMap is keyed by "STREET, CITY, STATE"
                const lookupKey = batchItem.address ? (normalizeAddressForLookup(batchItem.address) || batchItem.address) : null;
                const recordInfo = lookupKey ? (recordsMap.get(batchItem.address) ?? recordsMap.get(lookupKey)) : null;
                if (!recordInfo) {
                    console.log(`[${cityCode} SYNC] Skipping property with no record: ${batchItem.address}`);
                    continue;
                }
                
                // Get buyer and seller names from record
                const buyerName = recordInfo.record.buyerName || "";
                const sellerName = recordInfo.record.sellerName || "";
                const buyerOwnershipCode = recordInfo.record.buyerOwnershipCode || null;
                
                // Check if buyer or seller is a corporation (not a trust)
                const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
                const isSellerCorporate = isFlippingCompany(sellerName, null);
                
                // Double-check: skip if neither is corporate (safety check)
                if (!isBuyerCorporate && !isSellerCorporate) {
                    continue;
                }
                
                // Normalize county from API response (e.g., "San Diego County, California" -> "San Diego")
                const normalizedCounty = normalizeCountyName(propertyData.county);
                
                validProperties.push({
                    batchItem,
                    propertyData,
                    recordInfo,
                    sfrPropertyId: Number(sfrPropertyId),
                    normalizedCounty
                });
                
                // Track BUYER company -> counties mapping (only if buyer is corporate)
                if (isBuyerCorporate && normalizedCounty) {
                    const normalizedBuyerNameForStorage = normalizeCompanyNameForStorage(buyerName);
                    if (normalizedBuyerNameForStorage) {
                        const normalizedBuyerNameForCompare = normalizeCompanyNameForComparison(normalizedBuyerNameForStorage);
                        if (normalizedBuyerNameForCompare) {
                            if (!companyToCountiesMap.has(normalizedBuyerNameForCompare)) {
                                companyToCountiesMap.set(normalizedBuyerNameForCompare, new Set());
                            }
                            companyToCountiesMap.get(normalizedBuyerNameForCompare)!.add(normalizedCounty);
                        }
                    }
                }
                
                // Track SELLER company -> counties mapping (only if seller is corporate)
                if (isSellerCorporate && normalizedCounty) {
                    const normalizedSellerNameForStorage = normalizeCompanyNameForStorage(sellerName);
                    if (normalizedSellerNameForStorage) {
                        const normalizedSellerNameForCompare = normalizeCompanyNameForComparison(normalizedSellerNameForStorage);
                        if (normalizedSellerNameForCompare) {
                            if (!companyToCountiesMap.has(normalizedSellerNameForCompare)) {
                                companyToCountiesMap.set(normalizedSellerNameForCompare, new Set());
                            }
                            companyToCountiesMap.get(normalizedSellerNameForCompare)!.add(normalizedCounty);
                        }
                    }
                }
            }

            if (validProperties.length === 0) {
                console.log(`[${cityCode} SYNC] No valid properties to process in batch ${batchNum}`);
                continue;
            }

            // De-duplicate and batch insert companies
            const uniqueCompaniesToInsert: Array<{
                companyName: string;
                normalizedForCompare: string;
                counties: string[];
            }> = [];

            for (const [normalizedName, countiesSet] of Array.from(companyToCountiesMap.entries())) {
                // Check if company already exists in cache or database
                const existingCompany = contactsMap.get(normalizedName);
                
                if (!existingCompany) {
                    // Need to check database (might have been added by another batch)
                    const normalizedStorageName = normalizeCompanyNameForStorage(normalizeCompanyNameForComparison(normalizedName)!);
                    if (!normalizedStorageName) continue;
                    
                    const dbCompany = await findAndCacheCompany(
                        normalizedStorageName,
                        normalizedName,
                        contactsMap,
                        cityCode,
                        countiesSet,
                    );
                    
                    if (!dbCompany) {
                        // New company to insert - de-duplicate within batch
                        const storageName = normalizeCompanyNameForStorage(normalizeCompanyNameForComparison(normalizedName)!);
                        if (storageName && !uniqueCompaniesToInsert.some(c => c.normalizedForCompare === normalizedName)) {
                            uniqueCompaniesToInsert.push({
                                companyName: storageName,
                                normalizedForCompare: normalizedName,
                                counties: Array.from(countiesSet)
                            });
                        }
                    }
                } else {
                    // Existing company - update counties
                    await addCountiesToCompanyIfNeeded(existingCompany, countiesSet);
                }
            }

            // Batch insert new companies
            if (uniqueCompaniesToInsert.length > 0) {
                try {
                    const newCompanies = await db
                        .insert(companies)
                        .values(uniqueCompaniesToInsert.map(c => ({
                            companyName: c.companyName,
                            contactName: null,
                            contactEmail: null,
                            phoneNumber: null,
                            counties: c.counties,
                            updatedAt: new Date(),
                        })))
                        .returning();
                    
                    // Add new companies to cache
                    for (let i = 0; i < uniqueCompaniesToInsert.length; i++) {
                        const company = newCompanies[i];
                        if (company) {
                            contactsMap.set(uniqueCompaniesToInsert[i].normalizedForCompare, company);
                            totalContactsAdded++;
                        }
                    }
                    
                    console.log(`[${cityCode} SYNC] Batch inserted ${newCompanies.length} companies`);
                } catch (companyError: any) {
                    // Handle duplicates that might have been inserted concurrently
                    if (companyError?.code?.includes("23505") || companyError?.message?.includes("duplicate")) {
                        // Fetch existing companies and add to cache
                        for (const companyToInsert of uniqueCompaniesToInsert) {
                            await findAndCacheCompany(
                                companyToInsert.companyName,
                                companyToInsert.normalizedForCompare,
                                contactsMap,
                                cityCode,
                                companyToInsert.counties,
                            );
                        }
                    } else {
                        console.error(`[${cityCode} SYNC] Error batch inserting companies:`, companyError);
                    }
                }
            }

            // ====================================================================
            // STEP 2: COLLECT PROPERTIES AND CHECK EXISTING ONES
            // ====================================================================
            // Check which properties already exist
            const sfrPropertyIds = validProperties.map(p => p.sfrPropertyId);
            const existingPropertiesMap = new Map<number, any>(); // keyed by sfrPropertyId
            const existingPropertiesByIdMap = new Map<string, any>(); // keyed by property UUID
            
            if (sfrPropertyIds.length > 0) {
                const existingProps = await db
                    .select()
                    .from(propertiesV2)
                    .where(inArray(propertiesV2.sfrPropertyId, sfrPropertyIds));
                
                for (const prop of existingProps) {
                    existingPropertiesMap.set(prop.sfrPropertyId, prop);
                    existingPropertiesByIdMap.set(prop.id, prop);
                }
            }

            // ====================================================================
            // STEP 3: PROCESS PROPERTIES AND COLLECT DATA FOR BATCH INSERTS
            // ====================================================================
            interface PropertyToInsert {
                sfrPropertyId: number;
                companyId: string | null;
                propertyOwnerId: string | null;
                buyerId: string | null;
                sellerId: string | null;
                propertyClassDescription: string | null;
                propertyType: string | null;
                vacant: string | null;
                hoa: string | null;
                ownerType: string | null;
                purchaseMethod: string | null;
                listingStatus: string;
                status: string;
                monthsOwned: number | null;
                msa: string | null;
                county: string | null;
            }

            interface PropertyToUpdate {
                id: string;
                data: Partial<PropertyToInsert>;
            }

            const propertiesToInsert: PropertyToInsert[] = [];
            const propertiesToUpdate: PropertyToUpdate[] = [];
            const propertyDetailsMap = new Map<number, {
                propertyData: any;
                recordInfo: { record: any; recordingDate: string };
                normalizedCounty: string | null;
                isBuyerCorporate: boolean;
                isSellerCorporate: boolean;
            }>();

            // Process each valid property to determine company IDs and collect data
            for (const validProp of validProperties) {
                try {
                    totalProcessed++;
                    
                    const { propertyData, recordInfo, sfrPropertyId, normalizedCounty } = validProp;
                    
                    // Get buyer and seller names
                    const buyerName = recordInfo!.record.buyerName || "";
                    const sellerName = recordInfo!.record.sellerName || "";
                    const buyerOwnershipCode = recordInfo!.record.buyerOwnershipCode || null;
                    
                    // Determine if buyer and seller are corporate (not trust)
                    const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
                    const isSellerCorporate = isFlippingCompany(sellerName, null);
                    
                    // Determine buyer_id (null if buyer is individual or trust)
                    let buyerId: string | null = null;
                    if (isBuyerCorporate) {
                        const normalizedBuyerNameForStorage = normalizeCompanyNameForStorage(buyerName);
                        const normalizedBuyerNameForCompare = normalizeCompanyNameForComparison(normalizedBuyerNameForStorage || '');
                        let buyerCompany = normalizedBuyerNameForCompare ? contactsMap.get(normalizedBuyerNameForCompare) : null;
                        
                        // If not in cache, try database
                        if (!buyerCompany && normalizedBuyerNameForStorage) {
                            buyerCompany = await findAndCacheCompany(
                                normalizedBuyerNameForStorage,
                                normalizedBuyerNameForCompare,
                                contactsMap,
                                cityCode,
                            );
                        }
                        
                        if (buyerCompany) {
                            buyerId = buyerCompany.id;
                        }
                    }
                    
                    // Determine seller_id (null if seller is individual or trust)
                    let sellerId: string | null = null;
                    if (isSellerCorporate) {
                        const normalizedSellerNameForStorage = normalizeCompanyNameForStorage(sellerName);
                        const normalizedSellerNameForCompare = normalizeCompanyNameForComparison(normalizedSellerNameForStorage || '');
                        let sellerCompany = normalizedSellerNameForCompare ? contactsMap.get(normalizedSellerNameForCompare) : null;
                        
                        // If not in cache, try database
                        if (!sellerCompany && normalizedSellerNameForStorage) {
                            sellerCompany = await findAndCacheCompany(
                                normalizedSellerNameForStorage,
                                normalizedSellerNameForCompare,
                                contactsMap,
                                cityCode,
                            );
                        }
                        
                        if (sellerCompany) {
                            sellerId = sellerCompany.id;
                        }
                    }
                    
                    // At least one of buyer or seller should be corporate for us to process (checked via isBuyerCorporate/isSellerCorporate).
                    // We still store property and transaction even when company IDs are unresolved - names are preserved in transaction.
                    
                    // companyId and propertyOwnerId rules:
                    // - If buyer is a company (buyerId exists), they are the new owner: companyId = buyerId, propertyOwnerId = buyerId
                    // - If seller is a company but buyer is NOT (individual/trust), property was sold: companyId = null, propertyOwnerId = null
                    const companyId = buyerId; // Only set if buyer is a company
                    const propertyOwnerId = buyerId; // Only set if buyer is a company
                    
                    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
                    
                    // Determine status based on the new logic:
                    // 1. If seller is corporate AND buyer is NOT corporate (individual or trust) → status = "sold"
                    // 2. Otherwise: On Market → "on-market", Off Market → "in-renovation"
                    let status: string;
                    const isBuyerIndividualOrTrust = !isBuyerCorporate; // Buyer is individual or trust if NOT corporate
                    
                    if (isSellerCorporate && isBuyerIndividualOrTrust) {
                        // Corporation selling to individual/trust = property was sold (flip completed)
                        status = "sold";
                    } else if (propertyListingStatus === "on market" || propertyListingStatus === "on_market") {
                        status = "on-market";
                    } else {
                        // Default to "in-renovation" for "Off Market" or any other value
                        status = "in-renovation";
                    }
                    
                    // Store listingStatus as normalized value from API (on-market or off-market)
                    const listingStatus = propertyListingStatus === "on market" || propertyListingStatus === "on_market" ? "on-market" : "off-market";
                    
                    const propertyRecord: PropertyToInsert = {
                        sfrPropertyId,
                        companyId,
                        propertyOwnerId,
                        buyerId,
                        sellerId,
                        propertyClassDescription: propertyData.property_class_description || null,
                        propertyType: normalizePropertyType(propertyData.property_type) || null,
                        vacant: propertyData.vacant != null ? String(propertyData.vacant) : null,
                        hoa: propertyData.hoa ? String(propertyData.hoa) : null,
                        ownerType: propertyData.owner_type || null,
                        purchaseMethod: propertyData.purchase_method || null,
                        listingStatus,
                        status,
                        monthsOwned: propertyData.months_owned || null,
                        msa: propertyData.msa || msa || null,
                        county: normalizedCounty,
                    };
                    
                    const existingProperty = existingPropertiesMap.get(sfrPropertyId);
                    // Store property details for both inserts and updates (needed for transaction tracking)
                    propertyDetailsMap.set(sfrPropertyId, {
                        propertyData,
                        recordInfo: recordInfo!,
                        normalizedCounty,
                        isBuyerCorporate,
                        isSellerCorporate,
                    });
                    
                    if (existingProperty) {
                        propertiesToUpdate.push({
                            id: existingProperty.id,
                            data: propertyRecord
                        });
                    } else {
                        propertiesToInsert.push(propertyRecord);
                    }
                    
                } catch (error: any) {
                    console.error(`[${cityCode} SYNC] Error processing property for batch:`, error);
                    totalProcessed--;
                }
            }

            // ====================================================================
            // STEP 4: BATCH INSERT/UPDATE PROPERTIES
            // ====================================================================
            // Batch update existing properties
            if (propertiesToUpdate.length > 0) {
                for (const propUpdate of propertiesToUpdate) {
                    await db
                        .update(propertiesV2)
                        .set({
                            ...propUpdate.data,
                            updatedAt: sql`now()`,
                        })
                        .where(eq(propertiesV2.id, propUpdate.id));
                }
                totalUpdated += propertiesToUpdate.length;
                console.log(`[${cityCode} SYNC] Batch updated ${propertiesToUpdate.length} properties`);
            }

            // Batch insert new properties
            let insertedProperties: any[] = [];
            if (propertiesToInsert.length > 0) {
                try {
                    insertedProperties = await db
                        .insert(propertiesV2)
                        .values(propertiesToInsert)
                        .returning();
                    
                    totalInserted += insertedProperties.length;
                    console.log(`[${cityCode} SYNC] Batch inserted ${insertedProperties.length} properties in batch ${batchNum}`);
                } catch (insertError: any) {
                    console.error(`[${cityCode} SYNC] Error batch inserting ${propertiesToInsert.length} properties in batch ${batchNum}:`, insertError);
                    console.error(`[${cityCode} SYNC] First property in failed batch:`, propertiesToInsert[0]);
                    // Try inserting one at a time to see which ones fail
                    for (const propToInsert of propertiesToInsert) {
                        try {
                            const [inserted] = await db
                                .insert(propertiesV2)
                                .values(propToInsert)
                                .returning();
                            if (inserted) {
                                insertedProperties.push(inserted);
                                totalInserted++;
                            }
                        } catch (singleError: any) {
                            console.error(`[${cityCode} SYNC] Failed to insert property ${propToInsert.sfrPropertyId}:`, singleError);
                        }
                    }
                }
            }

            // ====================================================================
            // STEP 5: BATCH INSERT RELATED DATA
            // ====================================================================
            // Create map of sfrPropertyId -> propertyId for inserted properties
            const propertyIdMap = new Map<number, string>();
            for (const insertedProp of insertedProperties) {
                propertyIdMap.set(insertedProp.sfrPropertyId, insertedProp.id);
            }

            // Collect all related data for batch inserts using helper
            const dataCollectors = createPropertyDataCollectors();

            for (const insertedProp of insertedProperties) {
                const details = propertyDetailsMap.get(insertedProp.sfrPropertyId);
                if (!details) continue;

                const { propertyData, recordInfo, normalizedCounty } = details;
                const recordingDateFromBuyersMarket = normalizeDateToYMD(recordInfo.record?.recordingDate);

                // Collect all property-related data using helper
                collectPropertyData(
                    dataCollectors,
                    insertedProp.id,
                    propertyData as SfrPropertyData,
                    normalizedCounty,
                    recordingDateFromBuyersMarket
                );
            }

            // Batch insert all related data using helper
            await batchInsertPropertyData(dataCollectors);

            // ====================================================================
            // STEP 6: COLLECT AND INSERT PROPERTY TRANSACTIONS
            // ====================================================================
            // Collect transactions for all properties (both inserted and updated).
            // - acquisition: when company bought (buyer corporate)
            // - sale: when company sold to individual/trust (seller corporate)

            // Collect transaction data for all properties
            const transactionsToInsert: any[] = [];
            
            // Process inserted properties
            for (const insertedProp of insertedProperties) {
                const details = propertyDetailsMap.get(insertedProp.sfrPropertyId);
                if (!details) continue;

                const { propertyData, recordInfo, isBuyerCorporate, isSellerCorporate } = details;
                const propertyId = insertedProp.id;
                const txBuyerId = insertedProp.buyerId || null;
                const txSellerId = insertedProp.sellerId || null;

                // Determine transaction type and companyId:
                // - Company bought (buyer corporate): acquisition, companyId = buyerId
                // - Company sold (seller corporate, buyer individual/trust): sale, companyId = sellerId
                const isCompanySoldToIndividual = isSellerCorporate && !isBuyerCorporate;
                const transactionType = isCompanySoldToIndividual ? "sale" : "acquisition";
                const companyId = isCompanySoldToIndividual ? txSellerId : txBuyerId;

                if (propertyData.last_sale || propertyData.lastSale) {
                    const lastSale = propertyData.last_sale || propertyData.lastSale;
                    const transactionDate = lastSale.date || null;

                    if (transactionDate) {
                        const normalizedDate = normalizeDateToYMD(transactionDate);
                        if (!normalizedDate) continue; // Skip if date is invalid

                        // Get buyer name (the company)
                        const buyerName = recordInfo.record.buyerName || null;
                        const normalizedBuyerName = buyerName ? normalizeCompanyNameForStorage(buyerName) : null;

                        // Get seller name from current_sale if available
                        let sellerName: string | null = null;
                        if (propertyData.current_sale || propertyData.currentSale) {
                            const currentSale = propertyData.current_sale || propertyData.currentSale;
                            sellerName = normalizeCompanyNameForStorage(currentSale.seller_1 || currentSale.seller1) || null;
                        }
                        if (!sellerName && recordInfo.record.sellerName) {
                            sellerName = normalizeCompanyNameForStorage(recordInfo.record.sellerName) || null;
                        }

                        const notes = lastSale.document_type ? `Document Type: ${lastSale.document_type}` : null;

                        transactionsToInsert.push({
                            propertyId,
                            companyId,
                            buyerId: txBuyerId,
                            sellerId: txSellerId,
                            transactionType,
                            transactionDate: normalizedDate,
                            salePrice: lastSale.price ? String(lastSale.price) : null,
                            mtgType: lastSale.mtg_type || null,
                            mtgAmount: lastSale.mtg_amount ? String(lastSale.mtg_amount) : null,
                            buyerName: normalizedBuyerName,
                            sellerName,
                            notes,
                        });
                    }
                }
            }

            // Process updated properties
            for (const propUpdate of propertiesToUpdate) {
                const existingProp = existingPropertiesByIdMap.get(propUpdate.id);
                if (!existingProp) continue;

                const details = propertyDetailsMap.get(existingProp.sfrPropertyId);
                if (!details) continue;

                const { propertyData, recordInfo, isBuyerCorporate, isSellerCorporate } = details;
                const propertyId = propUpdate.id;
                const txBuyerId = propUpdate.data.buyerId !== undefined ? propUpdate.data.buyerId : existingProp.buyerId || null;
                const txSellerId = propUpdate.data.sellerId !== undefined ? propUpdate.data.sellerId : existingProp.sellerId || null;

                const transactionType = getTransactionType(isBuyerCorporate, isSellerCorporate);

                if (propertyData.last_sale || propertyData.lastSale) {
                    const lastSale = propertyData.last_sale || propertyData.lastSale;
                    const transactionDate = lastSale.date || null;

                    if (transactionDate) {
                        const normalizedDate = normalizeDateToYMD(transactionDate);
                        if (!normalizedDate) continue;

                        const buyerName = recordInfo.record.buyerName || null;
                        const normalizedBuyerName = buyerName ? normalizeCompanyNameForStorage(buyerName) : null;

                        let sellerName: string | null = null;
                        if (propertyData.current_sale || propertyData.currentSale) {
                            const currentSale = propertyData.current_sale || propertyData.currentSale;
                            sellerName = normalizeCompanyNameForStorage(currentSale.seller_1 || currentSale.seller1) || null;
                        }
                        if (!sellerName && recordInfo.record.sellerName) {
                            sellerName = normalizeCompanyNameForStorage(recordInfo.record.sellerName) || null;
                        }

                        const notes = lastSale.document_type ? `Document Type: ${lastSale.document_type}` : null;

                        transactionsToInsert.push({
                            propertyId,
                            companyId: txBuyerId,
                            buyerId: txBuyerId,
                            sellerId: txSellerId,
                            transactionType,
                            transactionDate: normalizedDate,
                            salePrice: lastSale.price ? String(lastSale.price) : null,
                            mtgType: lastSale.mtg_type || null,
                            mtgAmount: lastSale.mtg_amount ? String(lastSale.mtg_amount) : null,
                            buyerName: normalizedBuyerName,
                            sellerName,
                            notes,
                        });
                    }
                }
            }

            // Check for existing transactions to prevent duplicates
            // We check for property_id + company_id + transaction_date + transaction_type combination
            if (transactionsToInsert.length > 0) {
                // Get unique property IDs and company IDs from transactions we want to insert
                const propertyIdsToCheck = Array.from(new Set(transactionsToInsert.map(tx => tx.propertyId)));
                const companyIdsToCheck = Array.from(new Set(transactionsToInsert.map(tx => tx.companyId).filter((id): id is string => id !== null)));
                const hasNullCompanyTransactions = transactionsToInsert.some(tx => tx.companyId === null);

                // Fetch existing transactions for these properties (both acquisition and sale types)
                let existingTransactions: any[] = [];
                if (propertyIdsToCheck.length > 0) {
                    const transactionTypesToCheck = ["acquisition", "sale", "company-to-company"];
                    if (companyIdsToCheck.length > 0) {
                        const withCompanyTx = await db
                            .select({
                                propertyId: propertyTransactions.propertyId,
                                companyId: propertyTransactions.companyId,
                                transactionDate: propertyTransactions.transactionDate,
                                transactionType: propertyTransactions.transactionType,
                            })
                            .from(propertyTransactions)
                            .where(
                                and(
                                    inArray(propertyTransactions.propertyId, propertyIdsToCheck),
                                    inArray(propertyTransactions.companyId, companyIdsToCheck),
                                    inArray(propertyTransactions.transactionType, transactionTypesToCheck)
                                )
                            );
                        existingTransactions.push(...withCompanyTx);
                    }
                    if (hasNullCompanyTransactions) {
                        const nullCompanyTx = await db
                            .select({
                                propertyId: propertyTransactions.propertyId,
                                companyId: propertyTransactions.companyId,
                                transactionDate: propertyTransactions.transactionDate,
                                transactionType: propertyTransactions.transactionType,
                            })
                            .from(propertyTransactions)
                            .where(
                                and(
                                    inArray(propertyTransactions.propertyId, propertyIdsToCheck),
                                    sql`${propertyTransactions.companyId} IS NULL`,
                                    inArray(propertyTransactions.transactionType, transactionTypesToCheck)
                                )
                            );
                        existingTransactions.push(...nullCompanyTx);
                    }
                }

                // Create a Set of existing transaction keys for fast lookup
                const existingTxKeys = new Set<string>();
                for (const existingTx of existingTransactions) {
                    const key = `${existingTx.propertyId}-${existingTx.companyId || 'null'}-${existingTx.transactionDate}-${existingTx.transactionType}`;
                    existingTxKeys.add(key);
                }

                // Filter out transactions that already exist
                const newTransactionsToInsert = transactionsToInsert.filter(tx => {
                    const key = `${tx.propertyId}-${tx.companyId || 'null'}-${tx.transactionDate}-${tx.transactionType}`;
                    return !existingTxKeys.has(key);
                });

                // Batch insert new transactions
                if (newTransactionsToInsert.length > 0) {
                    try {
                        await db.insert(propertyTransactions).values(newTransactionsToInsert);
                        console.log(`[${cityCode} SYNC] Inserted ${newTransactionsToInsert.length} new property transactions (${transactionsToInsert.length - newTransactionsToInsert.length} were duplicates)`);
                    } catch (txError: any) {
                        console.error(`[${cityCode} SYNC] Error inserting property transactions:`, txError);
                        // Try inserting one at a time to see which ones fail
                        let insertedCount = 0;
                        for (const tx of newTransactionsToInsert) {
                            try {
                                await db.insert(propertyTransactions).values(tx);
                                insertedCount++;
                            } catch (singleTxError: any) {
                                console.error(`[${cityCode} SYNC] Failed to insert transaction for property ${tx.propertyId}:`, singleTxError);
                            }
                        }
                        console.log(`[${cityCode} SYNC] Inserted ${insertedCount} transactions individually`);
                    }
                }
            }

            console.log(`[${cityCode} SYNC] Processed batch ${batchNum}: ${totalProcessed} processed, ${propertiesToInsert.length} inserted, ${propertiesToUpdate.length} updated`);
            
            // NOTE: We do NOT persist boundaryDate after each batch. 
            // Because addresses are collected from /buyers/market sorted by sale_date, but batches 
            // are processed in arbitrary order. If we crash mid-batch and restart from boundaryDate,
            // we could skip properties with earlier sale dates that weren't yet processed.
            // 
            // Instead, we only persist boundaryDate at the END of a successful sync run.
            // On failure, we restart from the original lastSaleDate and re-process.
            // This is safe because existing properties are updated (idempotent), and ensures no data loss.
        }
        
        // Persist final sync state
        // Use latest sale date minus 1 day for next sync (handled by persistSyncState)
        // This ensures we resume from where we left off
        const persistedState = await persistSyncState({
            syncStateId: syncStateId,
            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            initialTotalSynced: initialTotalSynced ?? 0,
            processed: totalProcessed ?? 0,
            finalSaleDate: boundaryDate ?? null,
            cityCode,
        });
        
        console.log(`[${cityCode} SYNC] Sync complete for ${msa}: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);
        
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
        console.error(`[${cityCode} SYNC] Error syncing ${msa}:`, error);
        // NOTE: On failure, we do NOT persist the boundaryDate.
        // We keep the original lastSaleDate so the next sync run restarts from the same point.
        // This ensures no data is skipped due to partial processing.
        // Existing properties will be safely updated on retry (idempotent).
        const originalLastSaleDate = syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null;
        console.log(`[${cityCode} SYNC] Sync failed for ${msa}. Will restart from original lastSaleDate: ${originalLastSaleDate}. Processed ${totalProcessed ?? 0} records before failure.`);
        
        // Still update last_sync_at to track that a sync attempt was made, even on failure
        // This preserves lastSaleDate but updates the timestamp
        if (syncStateId) {
            try {
                await persistSyncState({
                    syncStateId: syncStateId,
                    previousLastSaleDate: originalLastSaleDate,
                    initialTotalSynced: initialTotalSynced ?? 0,
                    processed: totalProcessed ?? 0,
                    finalSaleDate: null, // Don't update lastSaleDate on failure
                    cityCode,
                });
                console.log(`[${cityCode} SYNC] Updated last_sync_at timestamp after failure`);
            } catch (persistError: any) {
                console.error(`[${cityCode} SYNC] Failed to update last_sync_at after error:`, persistError);
            }
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error syncing ${msa}: ${errorMessage}`);
    }
}

router.post("/sfr", requireAdminAuth, async (req, res) => { 
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
                const result = await syncMSA(syncState.msa, "temp", API_KEY, API_URL, today);
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