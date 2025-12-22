import { Router } from "express";
import { db } from "server/storage";
import {
  properties,
  companyContacts,
  sfrSyncState,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { normalizeToTitleCase } from "server/utils/normalizeToTitleCase";
import { geocodeAddress } from "server/utils/geocodeAddress";
import { normalizeCompanyNameForComparison, normalizeCompanyNameForStorage } from "server/utils/normalizeCompanyName";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";
import { mapPropertyType } from "server/utils/mapPropertyType";

const router = Router();

/* SFR Analytics API calls */
router.post("/sfr", requireAdminAuth, async (req, res) => { 
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const MSA = "San Diego-Chula Vista-Carlsbad, CA";

    const today = new Date().toISOString().split("T")[0];

    // Sync state / counters exposed to outer scope so we can persist partial progress on failure
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

    try {
        // Get or create sync state for this MSA
        syncState = await db
        .select()
        .from(sfrSyncState)
        .where(eq(sfrSyncState.msa, MSA))
        .limit(1);



        if (syncState.length === 0) {
            // Create new sync state with default min date
            minDate = "2025-12-03"; // Default start date
            const [newSyncState] = await db
                .insert(sfrSyncState)
                .values({
                msa: MSA,
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

        console.log(`[SFR SYNC] Starting sync for ${MSA} from ${minDate} to ${today}`);

        // Process properties in batches to avoid memory issues
        const BATCH_SIZE = 50;
        let batchBuffer: any[] = [];

        while (shouldContinue) {
            const requestBody = {
                "msa": MSA,
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
                console.error(`[SFR SYNC] API error on page ${currentPage}:`, errorText);
                // Persist partial progress before returning
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

                return res.status(response.status).json({ 
                message: "Error fetching SFR buyer data",
                status: response.status,
                error: errorText
                });
            }

            const data = await response.json();

            // Check if data is empty
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.log(`[SFR SYNC] No more data on page ${currentPage}, stopping`);
                shouldContinue = false;
                break;
            }
        
            console.log(`[SFR SYNC] Fetched page ${currentPage} with ${data.length} records`);
            
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

                    let price: number = 0
                    if ((record.saleValue - record.avmValue) > 1000000) {
                        price = record.avmValue
                    } else {
                        price = record.saleValue
                    }
                
                    const propertyData: any = {
                        address: normalizedAddress,
                        city: normalizedCity,
                        state: record.state || "CA",
                        zipCode: record.zipCode || "",
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
                        msa: record.msa || MSA,
                        
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
                        // Note: latestSaleDate was already updated above, so we still track it even for skipped records
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

                    // Handle company contact
                    const rawCompanyName = record.buyerName || null;
                    const normalizedCompanyNameForStorage = normalizeCompanyNameForStorage(rawCompanyName);
                    
                    if (normalizedCompanyNameForStorage) {
                        const contactName = normalizeToTitleCase(record.formattedBuyerName || record.buyer_formatted_name) || normalizedCompanyNameForStorage;
                        const contactEmail = record.contactEmail || record.contact_email || null;

                        // Check if company contact already exists using punctuation-insensitive comparison
                        const normalizedCompanyNameForCompare = normalizeCompanyNameForComparison(normalizedCompanyNameForStorage);
                        const allContacts = await db
                        .select()
                        .from(companyContacts);
                        
                        // Find existing contact by normalizing and comparing (ignoring punctuation)
                        const existingContact = allContacts.find(contact => {
                        const normalizedExisting = normalizeCompanyNameForComparison(contact.companyName);
                        return normalizedExisting && normalizedExisting === normalizedCompanyNameForCompare;
                        });

                        if (!existingContact) {
                        // Insert new company contact with normalized storage format
                            try {
                                await db.insert(companyContacts).values({
                                    companyName: normalizedCompanyNameForStorage,
                                    contactName: null,
                                    contactEmail: contactEmail,
                                });
                                totalContactsAdded++;
                                console.log(`[SFR SYNC] Added new company contact: ${normalizedCompanyNameForStorage}`);
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

                            // Set property owner and contact info using existing contact data
                            propertyData.propertyOwner = existingContact.companyName; // Use existing DB value for consistency
                            propertyData.companyContactName = existingContact.contactName || contactName;
                            propertyData.companyContactEmail = existingContact.contactEmail || contactEmail;
                        }
                    }

                    // Check for existing property by SFR IDs first
                    let existingProperty = null;
                    
                    if (propertyData.sfrPropertyId) {
                        const byPropertyId = await db
                        .select()
                        .from(properties)
                        .where(eq(properties.sfrPropertyId, propertyData.sfrPropertyId))
                        .limit(1);
                        if (byPropertyId.length > 0) {
                        existingProperty = byPropertyId[0];
                        }
                    }
                    
                    if (!existingProperty && propertyData.sfrRecordId) {
                        const byRecordId = await db
                        .select()
                        .from(properties)
                        .where(eq(properties.sfrRecordId, propertyData.sfrRecordId))
                        .limit(1);
                        if (byRecordId.length > 0) {
                        existingProperty = byRecordId[0];
                        }
                    }

                    // If no match by SFR IDs, check by address
                    if (!existingProperty && propertyData.address) {
                        const normalizedAddressForCompare = propertyData.address.toLowerCase().trim();
                        const normalizedCityForCompare = propertyData.city.toLowerCase().trim();
                        
                        const byAddress = await db
                        .select()
                        .from(properties)
                        .where(
                            and(
                            sql`LOWER(TRIM(${properties.address})) = ${normalizedAddressForCompare}`,
                            sql`LOWER(TRIM(${properties.city})) = ${normalizedCityForCompare}`,
                            eq(properties.state, propertyData.state),
                            eq(properties.zipCode, propertyData.zipCode)
                            )
                        )
                        .limit(1);
                        if (byAddress.length > 0) {
                            existingProperty = byAddress[0];
                        }
                    }

                    if (existingProperty) {
                        // Update existing property if this record is more recent
                        const shouldUpdate = !existingProperty.recordingDate || 
                        (propertyData.recordingDate && propertyData.recordingDate > existingProperty.recordingDate);
                        
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

        console.log(`[SFR SYNC] Sync complete: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated, ${totalContactsAdded} contacts added`);

        return res.status(200).json({
            success: true,
            totalProcessed,
            totalInserted,
            totalUpdated,
            totalContactsAdded,
            dateRange: {
                from: minDate,
                to: latestSaleDate || today
            },
            lastSaleDate: persistedDate,
            msa: MSA,
        });
        
    } catch (error) {
        console.error("[SFR SYNC] Error:", error);
        try {
            const persistedDate = await persistSyncStateExplicit({
                syncStateId: syncStateId,
                previousLastSaleDate: syncState && syncState.length > 0 ? syncState[0].lastSaleDate : null,
                initialTotalSynced: initialTotalSynced ?? 0,
                processed: totalProcessed ?? 0,
                finalSaleDate: latestSaleDate ?? null,
            });
            console.log(`[SFR SYNC] Persisted sync state after failure. lastSaleDate: ${persistedDate}`);
        } catch (e) {
            console.error("[SFR SYNC] Failed to persist sync state after error:", e);
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.status(500).json({ 
            message: "Error syncing SFR buyer data",
            error: errorMessage
        });
    }
});

export default router