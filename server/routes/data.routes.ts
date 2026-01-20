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

/* SFR Analytics API calls */

// Helper to persist sync state on exit or failure. Accepts explicit options so it can be called from error/catch paths.
// Stores saleDate - 1 day because the API range is non-inclusive
async function persistSyncStateExplicit(options: {
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
        console.warn("[SFR SYNC] No syncStateId provided to persist state");
        return previousLastSaleDate || null;
    }

    const newTotalSynced = (initialTotalSynced || 0) + (processed || 0);
    // Use the latest saleDate from processed properties, or keep the previous one if no new data
    let toSet = finalSaleDate || previousLastSaleDate || null;
    
    // Subtract 1 day because the API range is non-inclusive (we want to start from the day after)
    if (toSet) {
        const date = new Date(toSet);
        date.setDate(date.getDate() - 1);
        toSet = date.toISOString().split("T")[0];
    }

    try {
        await db
            .update(sfrSyncState)
            .set({
                lastSaleDate: toSet, // Store saleDate - 1 day in lastSaleDate field
                totalRecordsSynced: newTotalSynced,
                lastSyncAt: sql`now()`,
            })
            .where(eq(sfrSyncState.id, syncStateId));

        console.log(
            `[SFR SYNC] Persisted sync state. lastSaleDate (saleDate - 1): ${toSet}, totalRecordsSynced: ${newTotalSynced}`,
        );
        return toSet;
    } catch (e: any) {
        console.error("[SFR SYNC] Failed to persist sync state:", e);
        return toSet;
    }
}

// Sync function for a single MSA
async function syncMSA(msa: string, API_KEY: string, API_URL: string, today: string) {
    // Sync state / counters for this MSA
    let minDate: string = "";
    let syncStateId: number | null = null;
    let initialTotalSynced: number = 0;
    let syncState: any[] = [];

    // Track counters accessible in catch/finalize
    let currentPage = 1;
    let shouldContinue = true;
    let totalProcessed = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalContactsAdded = 0;
    let latestSaleDate: string | null = null; // Track the saleDate of the last successfully processed property

    try {
        // Get or create sync state for this MSA
        syncState = await db
            .select()
            .from(sfrSyncState)
            .where(eq(sfrSyncState.msa, msa))
            .limit(1);

        if (syncState.length === 0) {
            // Create new sync state with default min date
            minDate = "2025-12-03"; // Default start date
            const [newSyncState] = await db
                .insert(sfrSyncState)
                .values({
                    msa: msa,
                    lastSaleDate: null,
                    totalRecordsSynced: 0,
                })
                .returning();
            syncStateId = newSyncState.id;
            initialTotalSynced = 0;
        } else {
            // Use last sale date as min date (stored value is already saleDate - 1, so use it directly)
            const lastDate = syncState[0].lastSaleDate;
            if (lastDate) {
                minDate = new Date(lastDate).toISOString().split("T")[0];
            } else {
                minDate = "2025-12-03"; // Default start date
            }
            syncStateId = syncState[0].id;
            initialTotalSynced = syncState[0].totalRecordsSynced || 0;
        }

        console.log(`[SFR SYNC] Starting sync for ${msa} from ${minDate} to ${today}`);

        // Load all company contacts into memory once (shared across all MSAs)
        const allContacts = await db.select().from(companyContacts);
        const contactsMap = new Map<string, typeof allContacts[0]>();

        for (const contact of allContacts) {
            const normalizedKey = normalizeCompanyNameForComparison(contact.companyName);
            if (normalizedKey) {
                contactsMap.set(normalizedKey, contact);
            }
        }
        console.log(`[SFR SYNC] Loaded ${contactsMap.size} company contacts into cache`);

        // Process properties in batches to avoid memory issues
        const BATCH_SIZE = 50;
        let batchBuffer: any[] = [];

        while (shouldContinue) {
            const requestBody = {
                "msa": msa,
                "city": null,
                "salesDate": {
                    "min": minDate,
                    "max": today
                },
                "pagination": {
                    "page": currentPage,
                    "pageSize": 100
                },
                "sort": {
                    "field": "recording_date",
                    "direction": "asc"
                }
            };
        
            const response = await fetch(`${API_URL}/buyers/market/page`, {
                method: 'POST',
                headers: {
                    'X-API-TOKEN': API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
        
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[SFR SYNC] API error on page ${currentPage} for ${msa}:`, errorText);
                // Persist partial progress before throwing
                try {
                    const persistedDate = await persistSyncStateExplicit({
                        syncStateId,
                        previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                        initialTotalSynced,
                        processed: totalProcessed,
                        finalSaleDate: latestSaleDate,
                    });
                    console.log(`[SFR SYNC] Persisted sync state due to API error. lastSaleDate: ${persistedDate}`);
                } catch (e) {
                    console.error("[SFR SYNC] Failed to persist state after API error:", e);
                }

                throw new Error(`API error for ${msa}: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            // Check if data is empty
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.log(`[SFR SYNC] No more data on page ${currentPage} for ${msa}, stopping`);
                shouldContinue = false;
                break;
            }
        
            console.log(`[SFR SYNC] Fetched page ${currentPage} with ${data.length} records for ${msa}`);
        
            if (data.length > 0) {
                console.log(`[SFR SYNC] Sample record structure:`, JSON.stringify(data[0], null, 2));
            }

            // Process each property
            for (const record of data) {
                try {
                    // Normalize text fields
                    const rawAddress = record.address || "";
                    const rawCity = record.city || "";
                    const rawBuyerName = record.buyerName || null;
                    const rawSellerName = record.sellerName || null;
                    
                    const normalizedAddress = normalizeToTitleCase(rawAddress);
                    const normalizedCity = normalizeToTitleCase(rawCity);
                    
                    // Validate required fields
                    if (!normalizedAddress || normalizedAddress.trim() === "") {
                        console.warn(`[SFR SYNC] Skipping record with empty address:`, JSON.stringify(record, null, 2));
                        totalProcessed++;
                        continue;
                    }
                    
                    if (!normalizedCity || normalizedCity.trim() === "") {
                        console.warn(`[SFR SYNC] Skipping record with empty city:`, JSON.stringify(record, null, 2));
                        totalProcessed++;
                        continue;
                    }

                    const hasStreetNumber = /^\d+/.test(normalizedAddress)

                    if (!hasStreetNumber) {
                        console.warn(`[SFR SYNC] Skipping record with no street number`, JSON.stringify(record, null, 2))
                        totalProcessed++;
                        continue;
                    }

                    let price: number = 0

                    if ((record.saleValue - record.avmValue) > 1000000) {
                        price = record.avmValue
                    } else {
                        price = record.saleValue
                    }

                    if (price <= 0) {
                        console.warn(`[SFR SYNC] Skipping record with invalid price: ${price}`, JSON.stringify(record, null, 2))
                        totalProcessed++;
                        continue;
                    }
                    
                    const propertyData: any = {
                        address: normalizedAddress,
                        city: normalizedCity,
                        state: record.state || "CA",
                        zipCode: record.zipCode || "",
                        county: "UNKNOWN",

                        price: price || 0,
                        bedrooms: record.bedrooms || 0,
                        bathrooms: record.bathrooms || 0,
                        squareFeet: record.buildingArea || 0,
                        propertyType: mapPropertyType(record.propertyType || null),
                        purchasePrice: record.purchasePrice || null,
                        dateSold: record.saleDate || null,
                        status: record.status || "in-renovation",
                        
                        // Buyer info
                        buyerName: normalizeToTitleCase(rawBuyerName),
                        buyerFormattedName: normalizeToTitleCase(record.formattedBuyerName || ""),
                        phone: record.phone || null,
                        isCorporate: record.isCorporate || false,
                        isCashBuyer: record.isCashBuyer || false,
                        isDiscountedPurchase: record.isDiscountedPurchase || false,
                        isPrivateLender: record.isPrivateLender || false,
                        buyerPropertiesCount: record.buyerPropertiesCount || null,
                        buyerTransactionsCount: record.buyerTransactionsCount || null,
                        
                        // Seller/lender
                        sellerName: normalizeToTitleCase(rawSellerName),
                        lenderName: normalizeToTitleCase(record.lenderName),
                        
                        // Exit info
                        exitValue: record.exitValue || record.exit_value || null,
                        exitBuyerName: normalizeToTitleCase(record.exitBuyerName),
                        profitLoss: record.profitLoss || null,
                        holdDays: record.holdDays || null,
                        
                        // Financials
                        saleValue: record.saleValue || null,
                        avmValue: record.avmValue || null,
                        loanAmount: record.loanAmount || null,
                        
                        // SFR API IDs
                        sfrPropertyId: record.propertyId || null,
                        sfrRecordId: record.id || null,
                        
                        // Market
                        msa: record.msa || msa,
                        
                        // Dates
                        recordingDate: record.recordingDate || null,
                        
                        // Coordinates
                        latitude: record.latitude || null,
                        longitude: record.longitude || null,
                        
                        // Additional fields
                        yearBuilt: record.yearBuilt || null,
                    };

                    // Track latest saleDate (not recordingDate) - this is what we'll store in lastSaleDate
                    // Extract saleDate from propertyData.dateSold (which comes from record.saleDate)
                    let saleDateStr: string | null = null;
                    if (propertyData.dateSold) {
                        if (propertyData.dateSold instanceof Date) {
                            saleDateStr = propertyData.dateSold.toISOString().split("T")[0];
                        } else if (typeof propertyData.dateSold === 'string') {
                            saleDateStr = propertyData.dateSold.split("T")[0];
                        }
                    }
                    
                    // Update latestSaleDate immediately for ALL processed records (even if we skip them later)
                    // This ensures we track the latest saleDate we've seen, regardless of whether we insert/update
                    if (saleDateStr && (!latestSaleDate || saleDateStr > latestSaleDate)) {
                        latestSaleDate = saleDateStr;
                    }
                    
                    // Store saleDate with property data for later use
                    if (saleDateStr) {
                        propertyData._saleDate = saleDateStr;
                    }
                    
                    // Track latest recording date for property data (for comparison purposes)
                    let recordingDateStr: string | null = null;
                    if (propertyData.recordingDate) {
                        if (propertyData.recordingDate instanceof Date) {
                            recordingDateStr = propertyData.recordingDate.toISOString().split("T")[0];
                        } else if (typeof propertyData.recordingDate === 'string') {
                            recordingDateStr = propertyData.recordingDate.split("T")[0];
                        }
                    }
                    
                    // Store recordingDate as date string
                    if (recordingDateStr) {
                        propertyData.recordingDate = recordingDateStr;
                    }

                    // Skip non-corporate buyers — we only import corporate buyers and trusts            
                    if (!propertyData.isCorporate) {
                        console.log(`[SFR SYNC] Skipping non-corporate buyer: ${propertyData.buyerName || propertyData.address} (saleDate: ${saleDateStr || 'N/A'})`);
                        continue;
                    }

                    // Geocode if coordinates are missing
                    if ((!propertyData.latitude || !propertyData.longitude) && propertyData.address) {
                        const coords = await geocodeAddress(
                            propertyData.address,
                            propertyData.city,
                            propertyData.state,
                            propertyData.zipCode
                        );
                        if (coords) {
                            propertyData.latitude = coords.lat;
                            propertyData.longitude = coords.lng;
                        }
                    }

                    // Get county from longitude (x) and latitude (y) - do this after geocoding in case coordinates were just added
                    if (propertyData.latitude && propertyData.longitude) {
                        const county = await fetchCounty(propertyData.longitude, propertyData.latitude);
                        propertyData.county = county ? county : "UNKNOWN";
                    }

                    // Handle company contact
                    const rawCompanyName = record.buyerName || null;
                    const normalizedCompanyNameForStorage = normalizeCompanyNameForStorage(rawCompanyName);
                    
                    if (normalizedCompanyNameForStorage) {
                        const contactName = normalizeToTitleCase(record.formattedBuyerName || record.buyer_formatted_name) || normalizedCompanyNameForStorage;
                        const contactEmail = record.contactEmail || record.contact_email || null;
                        const propertyCounty = propertyData.county && propertyData.county !== "UNKNOWN" ? propertyData.county : null;

                        // Check if company contact already exists using in-memory cache
                        const normalizedCompanyNameForCompare = normalizeCompanyNameForComparison(normalizedCompanyNameForStorage);
                        const existingContact = normalizedCompanyNameForCompare ? contactsMap.get(normalizedCompanyNameForCompare) : null;

                        if (!existingContact) {
                            // Insert new company contact with normalized storage format
                            try {
                                // Create counties array with the property's county
                                const countiesArray = propertyCounty ? [propertyCounty] : [];
                                const countiesJson = JSON.stringify(countiesArray);

                                await db.insert(companyContacts).values({
                                    companyName: normalizedCompanyNameForStorage,
                                    contactName: null,
                                    contactEmail: contactEmail,
                                    counties: countiesJson,
                                    updatedAt: new Date(),
                                });
                                totalContactsAdded++;
                                console.log(`[SFR SYNC] Added new company contact: ${normalizedCompanyNameForStorage} with county: ${propertyCounty || 'none'}`);
                                
                                // Update the in-memory cache with the new contact
                                const [newContact] = await db
                                    .select()
                                    .from(companyContacts)
                                    .where(eq(companyContacts.companyName, normalizedCompanyNameForStorage))
                                    .limit(1);
                                if (newContact && normalizedCompanyNameForCompare) {
                                    contactsMap.set(normalizedCompanyNameForCompare, newContact);
                                    // Set propertyOwnerId to the new contact's ID
                                    propertyData.propertyOwnerId = newContact.id;
                                }
                            } catch (contactError: any) {
                                // Ignore duplicate key errors (race condition)
                                if (!contactError?.message?.includes("duplicate") && !contactError?.code?.includes("23505")) {
                                    console.error(`[SFR SYNC] Error adding company contact ${normalizedCompanyNameForStorage}:`, contactError);
                                } else {
                                    // If it was a duplicate error, try to fetch the existing contact
                                    try {
                                        const [duplicateContact] = await db
                                            .select()
                                            .from(companyContacts)
                                            .where(eq(companyContacts.companyName, normalizedCompanyNameForStorage))
                                            .limit(1);
                                        if (duplicateContact && normalizedCompanyNameForCompare) {
                                            contactsMap.set(normalizedCompanyNameForCompare, duplicateContact);
                                            propertyData.propertyOwnerId = duplicateContact.id;
                                        }
                                    } catch (fetchError) {
                                        console.error(`[SFR SYNC] Error fetching duplicate contact:`, fetchError);
                                    }
                                }
                            }
                        } else {
                            // Use the existing contact's ID for propertyOwnerId
                            propertyData.propertyOwnerId = existingContact.id;
                            console.log(`[SFR SYNC] Found existing company contact: ${existingContact.companyName} (matched: ${normalizedCompanyNameForStorage})`);

                            // Update counties if we have a valid county and it's not already in the array
                            if (propertyCounty && propertyCounty !== "UNKNOWN") {
                                try {
                                    // Parse existing counties JSON
                                    let countiesArray: string[] = [];
                                    if (existingContact.counties) {
                                        try {
                                            countiesArray = JSON.parse(existingContact.counties);
                                        } catch (parseError) {
                                            console.warn(`[SFR SYNC] Failed to parse counties JSON for ${existingContact.companyName}, starting fresh`);
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
                                            .where(eq(companyContacts.id, existingContact.id));

                                        console.log(`[SFR SYNC] Updated company contact ${existingContact.companyName} with new county: ${propertyCounty}`);

                                        // Update the in-memory cache
                                        const updatedContact = { ...existingContact, counties: updatedCountiesJson };
                                        if (normalizedCompanyNameForCompare) {
                                            contactsMap.set(normalizedCompanyNameForCompare, updatedContact);
                                        }
                                    } else {
                                        console.log(`[SFR SYNC] County ${propertyCounty} already exists for company ${existingContact.companyName}`);
                                    }
                                } catch (updateError: any) {
                                    console.error(`[SFR SYNC] Error updating counties for company contact ${existingContact.companyName}:`, updateError);
                                }
                            }
                        }
                    } else {
                        // No company name provided - set propertyOwnerId to null
                        propertyData.propertyOwnerId = null;
                    }

                    // Check for existing property by SFR IDs first
                    let existingProperty = null;
                    
                    if (propertyData.sfrPropertyId || propertyData.sfrRecordId || propertyData.address) {
                        const conditions = [];
                        
                        if (propertyData.sfrPropertyId) {
                            conditions.push(eq(properties.sfrPropertyId, propertyData.sfrPropertyId));
                        }
                        
                        if (propertyData.sfrRecordId) {
                            conditions.push(eq(properties.sfrRecordId, propertyData.sfrRecordId));
                        }
                        
                        if (propertyData.address) {
                            const normalizedAddressForCompare = propertyData.address.toLowerCase().trim();
                            const normalizedCityForCompare = propertyData.city.toLowerCase().trim();
                            
                            conditions.push(
                                and(
                                    sql`LOWER(TRIM(${properties.address})) = ${normalizedAddressForCompare}`,
                                    sql`LOWER(TRIM(${properties.city})) = ${normalizedCityForCompare}`,
                                    eq(properties.state, propertyData.state),
                                    eq(properties.zipCode, propertyData.zipCode)
                                )
                            );
                        }
                        
                        if (conditions.length > 0) {
                            const results = await db
                                .select()
                                .from(properties)
                                .where(or(...conditions))
                                .limit(1);
                            
                            if (results.length > 0) {
                                existingProperty = results[0];
                            }
                        }
                    }

                    if (existingProperty) {
                        // Update existing property if this record is more recent
                        const shouldUpdate = !existingProperty.recordingDate || (propertyData.recordingDate && propertyData.recordingDate > existingProperty.recordingDate);
                    
                        if (shouldUpdate) {
                            const { id, createdAt, _saleDate, ...updateData } = propertyData;
                            updateData.updatedAt = sql`now()`;
                            
                            try {
                                await db
                                    .update(properties)
                                    .set(updateData)
                                    .where(eq(properties.id, existingProperty.id));
                            
                                totalUpdated++;
                                console.log(`[SFR SYNC] Updated property: ${propertyData.address} (ID: ${existingProperty.id}, saleDate: ${saleDateStr || 'N/A'})`);
                            
                                // Persist sync state periodically after successful updates (every 10 updates)
                                if (totalUpdated % 10 === 0 && latestSaleDate) {
                                    try {
                                        await persistSyncStateExplicit({
                                            syncStateId,
                                            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                                            initialTotalSynced,
                                            processed: totalProcessed,
                                            finalSaleDate: latestSaleDate,
                                        });
                                    } catch (persistError) {
                                        console.error(`[SFR SYNC] Failed to persist state after periodic update:`, persistError);
                                    }
                                }
                            } catch (updateError: any) {
                                console.error(`[SFR SYNC] Error updating property ${propertyData.address}:`, updateError);
                            }
                        } else {
                            console.log(`[SFR SYNC] Skipping update for ${propertyData.address} - existing record is same or more recent (saleDate: ${saleDateStr || 'N/A'})`);
                        }
                    } else {
                        // Add to batch buffer for insertion (with _saleDate for tracking)
                        batchBuffer.push(propertyData);
                        console.log(`[SFR SYNC] Adding to batch buffer: ${propertyData.address} (saleDate: ${saleDateStr || 'N/A'})`);
                        
                        // Insert batch if full
                        if (batchBuffer.length >= BATCH_SIZE) {
                            try {
                                const batchToInsert = batchBuffer.map(({ _saleDate, ...prop }) => prop);
                                await db.insert(properties).values(batchToInsert);
                                totalInserted += batchBuffer.length;
                                console.log(`[SFR SYNC] Inserted batch of ${batchBuffer.length} properties`);
                                
                                // Persist sync state periodically after successful batch inserts
                                if (latestSaleDate) {
                                    try {
                                        await persistSyncStateExplicit({
                                            syncStateId,
                                            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                                            initialTotalSynced,
                                            processed: totalProcessed,
                                            finalSaleDate: latestSaleDate,
                                        });
                                    } catch (persistError) {
                                        console.error(`[SFR SYNC] Failed to persist state after batch insert:`, persistError);
                                    }
                                }
                                
                                batchBuffer = [];
                            } catch (batchError: any) {
                                console.error(`[SFR SYNC] Error inserting batch:`, batchError);
                                // Try inserting individually
                                for (const prop of batchBuffer) {
                                    try {
                                        const { _saleDate, ...propToInsert } = prop;
                                        await db.insert(properties).values([propToInsert]);
                                        totalInserted++;
                                        
                                        // Persist after each successful individual insert (for error recovery)
                                        if (prop._saleDate && latestSaleDate) {
                                            try {
                                                await persistSyncStateExplicit({
                                                    syncStateId,
                                                    previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                                                    initialTotalSynced,
                                                    processed: totalProcessed,
                                                    finalSaleDate: latestSaleDate,
                                                });
                                            } catch (persistError) {
                                                console.error(`[SFR SYNC] Failed to persist state after individual insert:`, persistError);
                                            }
                                        }
                                    } catch (individualError: any) {
                                        console.error(`[SFR SYNC] Error inserting property ${prop.address}:`, individualError);
                                    }
                                }
                                batchBuffer = [];
                            }
                        }
                    }

                    totalProcessed++;
                } catch (propertyError: any) {
                    console.error(`[SFR SYNC] Error processing property:`, propertyError);
                    console.error(`[SFR SYNC] Record that caused error:`, JSON.stringify(record, null, 2));
                    totalProcessed++;
                }
            }

            // Check if we should continue to next page
            if (data.length < 100) {
                shouldContinue = false;
            } else {
                currentPage++;
            }
        }

        // Insert any remaining properties in buffer (after while loop ends)
        if (batchBuffer.length > 0) {
            try {
                const batchToInsert = batchBuffer.map(({ _saleDate, ...prop }) => prop);
                await db.insert(properties).values(batchToInsert);
                totalInserted += batchBuffer.length;
                console.log(`[SFR SYNC] Inserted final batch of ${batchBuffer.length} properties`);
                
                // Note: latestSaleDate was already updated when we extracted saleDateStr, so no need to update again
            } catch (batchError: any) {
                console.error(`[SFR SYNC] Error inserting final batch:`, batchError);
                // Try inserting individually
                for (const prop of batchBuffer) {
                    try {
                        const { _saleDate, ...propToInsert } = prop;
                        await db.insert(properties).values([propToInsert]);
                        totalInserted++;
                        
                        // Persist after each successful individual insert (for error recovery)
                        if (latestSaleDate) {
                            try {
                                await persistSyncStateExplicit({
                                    syncStateId,
                                    previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                                    initialTotalSynced,
                                    processed: totalProcessed,
                                    finalSaleDate: latestSaleDate,
                                });
                            } catch (persistError) {
                                console.error(`[SFR SYNC] Failed to persist state after final individual insert:`, persistError);
                            }
                        }
                    } catch (individualError: any) {
                        console.error(`[SFR SYNC] Error inserting property ${prop.address}:`, individualError);
                    }
                }
            }
            batchBuffer = [];
        }

        // Persist final sync state (use latest saleDate from processed properties, minus 1 day)
        const persistedDate = await persistSyncStateExplicit({
            syncStateId: syncStateId,
            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            initialTotalSynced: initialTotalSynced ?? 0,
            processed: totalProcessed ?? 0,
            finalSaleDate: latestSaleDate ?? null,
        });

        console.log(`[SFR SYNC] Sync complete for ${msa}: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);

        return {
            success: true,
            msa,
            totalProcessed,
            totalInserted,
            totalUpdated,
            totalContactsAdded,
            dateRange: {
                from: minDate,
                to: latestSaleDate || today
            },
            lastSaleDate: persistedDate,
        };
        
    } catch (error) {
        console.error(`[SFR SYNC] Error syncing ${msa}:`, error);
        try {
            const persistedDate = await persistSyncStateExplicit({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: totalProcessed ?? 0,
                finalSaleDate: latestSaleDate ?? null,
            });
            console.log(`[SFR SYNC] Persisted sync state after failure for ${msa}. lastSaleDate: ${persistedDate}`);
        } catch (e) {
            console.error(`[SFR SYNC] Failed to persist sync state after error for ${msa}:`, e);
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
        // Fetch only the MSA with id = 1 (San Diego)
        const allSyncStates = await db
            .select()
            .from(sfrSyncState)
            .where(eq(sfrSyncState.id, 1));

        if (allSyncStates.length === 0) {
            return res.status(400).json({ 
                message: "MSA with id = 1 not found in sync state table.",
                error: "MSA not found"
            });
        }

        console.log(`[SFR SYNC] Found ${allSyncStates.length} MSA(s) to sync:`, allSyncStates.map(s => s.msa));

        // Sync each MSA sequentially
        const results = [];
        const errors = [];

        for (const syncState of allSyncStates) {
            try {
                console.log(`[SFR SYNC] Starting sync for MSA: ${syncState.msa}`);
                const result = await syncMSA(syncState.msa, API_KEY, API_URL, today);
                results.push(result);
                console.log(`[SFR SYNC] Completed sync for MSA: ${syncState.msa}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[SFR SYNC] Failed to sync MSA ${syncState.msa}:`, errorMessage);
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

        console.log(`[SFR SYNC] All syncs complete. Total: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);

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
        console.error("[SFR SYNC] Fatal error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ 
            message: "Error syncing SFR buyer data",
            error: errorMessage
        });
    }
});

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
        let latestRecordingDate: string | null = null; // Track the most recent recordingDate from both routes
        let earliestRecordingDate: string | null = null; // Track the earliest recordingDate (from last page) for sync state
        let latestSaleDate: string | null = null; // Track the most recent saleDate from buyers/market
        let earliestSaleDate: string | null = null; // Track the earliest saleDate (from last page) for sync state

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
        
        // Get min sale date for /buyers/market (use lastSaleDate from sync state)
        let minSaleDate: string = "";
        if (syncState.length > 0 && syncState[0].lastSaleDate) {
            minSaleDate = new Date(syncState[0].lastSaleDate).toISOString().split("T")[0];
        } else {
            minSaleDate = "2025-12-03"; // Default start date
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

        // Collect addresses from both /geo-analytics/flips and /buyers/market
        // Also store record data for status determination
        const addressesSet = new Set<string>();
        const flipsMap = new Map<string, any>(); // Map of address -> flip record (from /geo-analytics/flips)
        const buyersMarketMap = new Map<string, any>(); // Map of address -> buyers market record (from /buyers/market)
        
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
            flipsData.forEach((record: any) => {
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
        
        console.log(`[SFR SYNC V2] Completed flips pagination. Total addresses collected so far: ${addressesSet.size}`);
        
        // Fetch addresses from /buyers/market with pagination
        console.log(`[SFR SYNC V2] Fetching addresses from /buyers/market with pagination`);
        
        let buyersMarketPage = 1;
        let buyersMarketShouldContinue = true;
        
        while (buyersMarketShouldContinue) {
            const buyersMarketParams = new URLSearchParams({
                search_type: "msa",
                msa: msa,
                sales_date_min: minSaleDate,
                page_size: "100",
                sort: "-recording_date",
            });
            
            const buyersMarketResponse = await fetch(`${API_URL}/buyers/market?${buyersMarketParams.toString()}`, {
                method: 'GET',
                headers: {
                    'X-API-TOKEN': API_KEY,
                },
            });
            
            if (!buyersMarketResponse.ok) {
                const errorText = await buyersMarketResponse.text();
                throw new Error(`Buyers market API error on page ${buyersMarketPage}: ${buyersMarketResponse.status} - ${errorText}`);
            }
            
            const buyersMarketData = await buyersMarketResponse.json();
            
            // Check if we got empty data or non-array response
            if (!buyersMarketData || !Array.isArray(buyersMarketData) || buyersMarketData.length === 0) {
                console.log(`[SFR SYNC V2] No more data on page ${buyersMarketPage} for buyers/market, stopping`);
                buyersMarketShouldContinue = false;
                break;
            }
            
            console.log(`[SFR SYNC V2] Fetched page ${buyersMarketPage} with ${buyersMarketData.length} records from /buyers/market`);
            
            // Extract addresses and track dates
            buyersMarketData.forEach((record: any) => {
                // Build address string: "ADDRESS, CITY, STATE"
                if (record.address && record.city && record.state) {
                    const addressStr = `${record.address}, ${record.city}, ${record.state}`;
                    addressesSet.add(addressStr);
                    
                    // Store buyers market record for later lookup
                    // Only store if this is the most recent recordingDate for this address
                    if (!buyersMarketMap.has(addressStr) || 
                        (record.recordingDate && 
                         buyersMarketMap.get(addressStr)?.recordingDate && 
                         record.recordingDate > buyersMarketMap.get(addressStr)?.recordingDate)) {
                        buyersMarketMap.set(addressStr, record);
                    }
                }
                
                // Track recording dates
                if (record.recordingDate) {
                    const recDateStr = typeof record.recordingDate === 'string' ? record.recordingDate.split("T")[0] : record.recordingDate.toISOString().split("T")[0];
                    
                    if (!latestRecordingDate || recDateStr > latestRecordingDate) {
                        latestRecordingDate = recDateStr;
                    }
                    
                    if (!earliestRecordingDate || recDateStr < earliestRecordingDate) {
                        earliestRecordingDate = recDateStr;
                    }
                }
                
                // Track sale dates
                if (record.saleDate) {
                    const saleDateStr = typeof record.saleDate === 'string' ? record.saleDate.split("T")[0] : record.saleDate.toISOString().split("T")[0];
                    
                    if (!latestSaleDate || saleDateStr > latestSaleDate) {
                        latestSaleDate = saleDateStr;
                    }
                    
                    if (!earliestSaleDate || saleDateStr < earliestSaleDate) {
                        earliestSaleDate = saleDateStr;
                    }
                }
            });
            
            // Check if we should continue to next page
            if (buyersMarketData.length < 100) {
                buyersMarketShouldContinue = false;
            } else {
                buyersMarketPage++;
            }
        }
        
        console.log(`[SFR SYNC V2] Completed pagination. Total addresses collected: ${addressesSet.size}, earliest recording date: ${earliestRecordingDate || 'N/A'}, earliest sale date: ${earliestSaleDate || 'N/A'}`);
        
        const addressesArray = Array.from(addressesSet);
        console.log(`[SFR SYNC V2] Collected ${addressesArray.length} unique addresses to process (${flipsMap.size} from flips, ${buyersMarketMap.size} from buyers/market)`);
        
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
                    
                    // Get records from both routes for this address
                    const flipRecord = batchItem.address ? flipsMap.get(batchItem.address) : null;
                    const buyersMarketRecord = batchItem.address ? buyersMarketMap.get(batchItem.address) : null;
                    
                    // Determine which record to use based on most recent recordingDate
                    // Priority: most recent recordingDate wins
                    let activeRecord: any = null;
                    let recordSource: "flips" | "buyers-market" | null = null;
                    
                    if (flipRecord && buyersMarketRecord) {
                        // Both exist - use the one with most recent recordingDate
                        const flipRecDate = flipRecord.recordingDate ? (typeof flipRecord.recordingDate === 'string' ? flipRecord.recordingDate.split("T")[0] : flipRecord.recordingDate.toISOString().split("T")[0]) : "";
                        const buyersRecDate = buyersMarketRecord.recordingDate ? (typeof buyersMarketRecord.recordingDate === 'string' ? buyersMarketRecord.recordingDate.split("T")[0] : buyersMarketRecord.recordingDate.toISOString().split("T")[0]) : "";
                        
                        if (flipRecDate >= buyersRecDate) {
                            activeRecord = flipRecord;
                            recordSource = "flips";
                        } else {
                            activeRecord = buyersMarketRecord;
                            recordSource = "buyers-market";
                        }
                    } else if (flipRecord) {
                        activeRecord = flipRecord;
                        recordSource = "flips";
                    } else if (buyersMarketRecord) {
                        activeRecord = buyersMarketRecord;
                        recordSource = "buyers-market";
                    }
                    
                    // If no record from either route, skip
                    if (!activeRecord) {
                        console.log(`[SFR SYNC V2] Skipping property with no record from either route: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
                    // Note: We already prioritized by recordingDate when selecting activeRecord
                    // If both routes had records, we used the one with most recent recordingDate
                    
                    // Determine status and company based on record source
                    let status: string = "sold"; // Default
                    let listingStatus: string = "off_market"; // Default
                    let companyId: string | null = null;
                    let propertyOwnerId: string | null = null;
                    
                    // Get data from property batch response
                    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
                    
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
                    
                    // PROCESS BASED ON RECORD SOURCE
                    if (recordSource === "flips") {
                        // PROCESS /geo-analytics/flips RECORDS
                        // All properties from /geo-analytics/flips are flip exits = "sold" status
                        
                        // CHECK 1: Skip new construction transactions
                        const transactionType = activeRecord.transactionType;
                        const isNewConstruction = activeRecord.isNewConstruction === true;
                        
                        if ((transactionType && transactionType.toLowerCase() === "new construction") || isNewConstruction) {
                            console.log(`[SFR SYNC V2] Skipping new construction transaction: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // CHECK 2: Check if sellerCorp is true
                        const sellerCorp = activeRecord.sellerCorp === true;
                        if (!sellerCorp) {
                            console.log(`[SFR SYNC V2] Skipping property with non-corporate seller: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // CHECK 3: Get prevBuyer and validate it's a corporate entity
                        const prevBuyer = activeRecord.prevBuyer;
                        const flipperOwnershipCode = activeRecord.buyerOwnershipCode;
                        
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
                        
                        // Add prevBuyer (flipper) to companies table
                        const flipperCompanyId = await upsertCompany(prevBuyer);
                        if (flipperCompanyId) totalContactsAdded++;
                        
                        // Ensure we have a companyId
                        if (!flipperCompanyId) {
                            console.log(`[SFR SYNC V2] Failed to create/get flipper company for: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // All properties from /geo-analytics/flips are flip exits
                        // Status = "sold", listing_status = "off-market"
                        status = "sold";
                        listingStatus = "off_market";
                        companyId = flipperCompanyId; // Flipper company for history
                        propertyOwnerId = null; // Sold to end buyer, we don't track individuals
                        
                    } else if (recordSource === "buyers-market") {
                        // PROCESS /buyers/market RECORDS
                        // Properties from /buyers/market are active flips = "in-renovation" status
                        
                        // CHECK 1: Check if isCorporate is true
                        const isCorporate = activeRecord.isCorporate === true;
                        if (!isCorporate) {
                            console.log(`[SFR SYNC V2] Skipping property with non-corporate buyer: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // CHECK 2: Get buyerName and validate it's a corporate entity
                        const buyerName = activeRecord.buyerName;
                        
                        if (!buyerName) {
                            console.log(`[SFR SYNC V2] Skipping property with no buyerName: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // Check if buyerName is a trust - skip if trust
                        if (isTrust(buyerName, null)) {
                            console.log(`[SFR SYNC V2] Skipping property with trust as buyer: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // Check if buyerName is a valid corporate entity
                        // Exception: "Opendoor" is a company even without corporate indicators
                        const isOpendoor = buyerName.toLowerCase().includes("opendoor");
                        const isCorporateEntity = isOpendoor || isFlippingCompany(buyerName, null);
                        
                        if (!isCorporateEntity) {
                            console.log(`[SFR SYNC V2] Skipping property with non-corporate buyerName: ${batchItem.address} (buyerName: ${buyerName})`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // Add buyerName (company) to companies table
                        const buyerCompanyId = await upsertCompany(buyerName);
                        if (buyerCompanyId) totalContactsAdded++;
                        
                        // Ensure we have a companyId
                        if (!buyerCompanyId) {
                            console.log(`[SFR SYNC V2] Failed to create/get buyer company for: ${batchItem.address}`);
                            totalProcessed--; // Don't count this as processed
                            continue;
                        }
                        
                        // All properties from /buyers/market are active flips
                        // Status = "in-renovation", listing_status based on property batch
                        status = "in-renovation";
                        listingStatus = propertyListingStatus === "active" || propertyListingStatus === "pending" ? "on_market" : "off_market";
                        companyId = buyerCompanyId; // Buyer company
                        propertyOwnerId = buyerCompanyId; // Company owns the property (same as companyId)
                    } else {
                        // Should not happen, but skip if it does
                        console.log(`[SFR SYNC V2] Skipping property with unknown record source: ${batchItem.address}`);
                        totalProcessed--; // Don't count this as processed
                        continue;
                    }
                    
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
            // Use earliest dates if available (from pagination), otherwise use latest dates
            const recordingDateForSync = earliestRecordingDate || latestRecordingDate;
            const saleDateForSync = earliestSaleDate || latestSaleDate;
            if ((recordingDateForSync || saleDateForSync) && totalProcessed % 50 === 0) {
                try {
                    await persistSyncStateV2({
                        syncStateId,
                        previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
                        previousLastRecordingDate: syncState.length > 0 ? syncState[0].lastRecordingDate : null,
                        initialTotalSynced,
                        processed: totalProcessed,
                        finalSaleDate: saleDateForSync ?? null,
                        finalRecordingDate: recordingDateForSync ?? null,
                    });
                } catch (persistError) {
                    console.error(`[SFR SYNC V2] Failed to persist state after batch:`, persistError);
                }
            }
        }
        
        // Persist final sync state
        // Use earliest dates (from last page) minus 1 day for next sync
        // This ensures we resume from where we left off
        const recordingDateToStore = earliestRecordingDate || latestRecordingDate;
        const saleDateToStore = earliestSaleDate || latestSaleDate;
        const persistedState = await persistSyncStateV2({
            syncStateId: syncStateId,
            previousLastSaleDate: syncState.length > 0 ? syncState[0].lastSaleDate : null,
            previousLastRecordingDate: syncState.length > 0 ? syncState[0].lastRecordingDate : null,
            initialTotalSynced: initialTotalSynced ?? 0,
            processed: totalProcessed ?? 0,
            finalSaleDate: saleDateToStore ?? null,
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
            // Use earliest dates if available (from pagination), otherwise use latest dates
            const recordingDateForSync = earliestRecordingDate || latestRecordingDate;
            const saleDateForSync = earliestSaleDate || latestSaleDate;
            const persistedState = await persistSyncStateV2({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null,
                previousLastRecordingDate: syncState && syncState.length > 0 ? syncState[0].lastRecordingDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: totalProcessed ?? 0,
                finalSaleDate: saleDateForSync ?? null,
                finalRecordingDate: recordingDateForSync ?? null,
            });
            console.log(`[SFR SYNC V2] Persisted sync state after failure for ${msa}. lastRecordingDate: ${persistedState.lastRecordingDate}, lastSaleDate: ${persistedState.lastSaleDate}`);
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