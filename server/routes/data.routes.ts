import { Router } from "express";
import { db } from "server/storage";
import {
  properties,
  companyContacts,
  sfrSyncState,
} from "@shared/schema";
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
                                }
                            } catch (contactError: any) {
                                // Ignore duplicate key errors (race condition)
                                if (!contactError?.message?.includes("duplicate") && !contactError?.code?.includes("23505")) {
                                    console.error(`[SFR SYNC] Error adding company contact ${normalizedCompanyNameForStorage}:`, contactError);
                                }
                            }
                            
                            // Set property owner and contact info using normalized storage format
                            propertyData.propertyOwner = normalizedCompanyNameForStorage;
                            propertyData.companyContactName = null;
                            propertyData.companyContactEmail = contactEmail;
                        } else {
                            // Use the existing contact's name to ensure consistency (use existing DB value)
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

                            // Set property owner and contact info using existing contact data
                            propertyData.propertyOwner = existingContact.companyName; // Use existing DB value for consistency
                            propertyData.companyContactName = existingContact.contactName || contactName;
                            propertyData.companyContactEmail = existingContact.contactEmail || contactEmail;
                        }
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

export default router