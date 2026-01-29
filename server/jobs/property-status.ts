import { db } from "server/storage";
import { properties, addresses } from "../../database/schemas/properties.schema";
import { eq, sql, and, isNotNull, ne } from "drizzle-orm";

const BATCH_SIZE = 100; // Max 100 addresses per batch (SFR API limit)
const DB_FETCH_BATCH_SIZE = 500; // Fetch properties in chunks from database to avoid memory issues
const RATE_LIMIT_DELAY_MS = 1000; // 1 second delay between SFR API batches to avoid rate limiting

// Helper function to add delay between batches
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function UpdatePropertyStatus() {
    console.log(`[UPDATE PROPERTY STATUS] Starting property status update...`);
    
    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;
    
    if (!API_KEY || !API_URL) {
        console.error(`[UPDATE PROPERTY STATUS] SFR API not configured. SFR_API_KEY and SFR_API_URL must be set.`);
        return;
    }

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    try {
        // Step 1: Get total count of properties to process (for logging only)
        // Exclude properties with status "sold" since they don't need status updates
        console.log(`[UPDATE PROPERTY STATUS] Counting properties with addresses (excluding sold properties)...`);
        
        const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(properties)
            .innerJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                and(
                    isNotNull(addresses.formattedStreetAddress),
                    isNotNull(addresses.city),
                    isNotNull(addresses.state),
                    ne(properties.status, "sold") // Exclude sold properties
                )
            );

        const totalProperties = Number(countResult?.count || 0);
        console.log(`[UPDATE PROPERTY STATUS] Found ${totalProperties} properties to check`);

        if (totalProperties === 0) {
            console.log(`[UPDATE PROPERTY STATUS] No properties to process`);
            return;
        }

        // Track total processed to verify we hit all properties
        let expectedTotalProcessed = totalProperties;

        // Step 2: Process properties using cursor-based pagination
        // This is more reliable than offset-based pagination, especially when data changes during processing
        let globalBatchNum = 0;
        let cursor: string | null = null; // Last processed property ID
        let hasMore = true;

        while (hasMore) {
            globalBatchNum++;
            console.log(`[UPDATE PROPERTY STATUS] Fetching database batch ${globalBatchNum} (cursor: ${cursor || 'start'}, limit: ${DB_FETCH_BATCH_SIZE})`);

            // Build where conditions
            const whereConditions = [
                isNotNull(addresses.formattedStreetAddress),
                isNotNull(addresses.city),
                isNotNull(addresses.state),
                ne(properties.status, "sold") // Exclude sold properties
            ];

            // Add cursor condition if we have one (fetch properties with ID greater than cursor)
            if (cursor) {
                whereConditions.push(sql`${properties.id} > ${cursor}`);
            }

            // Fetch a chunk of properties from database using cursor-based pagination
            // Exclude properties with status "sold" since they don't need status updates
            // IMPORTANT: Order by id to ensure consistent pagination (prevents skipping/duplicates)
            const propertiesChunk = await db
                .select({
                    propertyId: properties.id,
                    sfrPropertyId: properties.sfrPropertyId,
                    currentStatus: properties.status,
                    currentListingStatus: properties.listingStatus,
                    address: addresses.formattedStreetAddress,
                    city: addresses.city,
                    state: addresses.state,
                })
                .from(properties)
                .innerJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...whereConditions))
                .orderBy(properties.id) // Ensure consistent ordering for cursor-based pagination
                .limit(DB_FETCH_BATCH_SIZE);

            if (propertiesChunk.length === 0) {
                console.log(`[UPDATE PROPERTY STATUS] No more properties to process`);
                hasMore = false;
                break;
            }

            // Update cursor to the last property ID in this chunk for next iteration
            const lastProperty = propertiesChunk[propertiesChunk.length - 1];
            cursor = lastProperty.propertyId;
            
            // Check if we got fewer properties than requested (means we're at the end)
            if (propertiesChunk.length < DB_FETCH_BATCH_SIZE) {
                hasMore = false;
            }

            // Step 3: Process this chunk in SFR API batches
            const totalSfrBatches = Math.ceil(propertiesChunk.length / BATCH_SIZE);
            
            for (let i = 0; i < propertiesChunk.length; i += BATCH_SIZE) {
                const batch = propertiesChunk.slice(i, i + BATCH_SIZE);
                globalBatchNum++;
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            
            console.log(`[UPDATE PROPERTY STATUS] Processing batch ${batchNum}/${totalSfrBatches} (${batch.length} properties)`);

            try {
                // Format addresses for batch API: "ADDRESS, CITY, STATE"
                const formattedAddresses = batch.map(prop => {
                    const address = (prop.address || '').trim();
                    const city = (prop.city || '').trim();
                    const state = (prop.state || '').trim();
                    return `${address}, ${city}, ${state}`;
                }).filter(addr => addr.length > 0);

                if (formattedAddresses.length === 0) {
                    console.warn(`[UPDATE PROPERTY STATUS] Batch ${batchNum} has no valid addresses, skipping`);
                    continue;
                }

                // Step 3: Call SFR API /properties/batch
                const addressesParam = formattedAddresses.join('|');
                const batchResponse = await fetch(`${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`, {
                    method: 'GET',
                    headers: {
                        'X-API-TOKEN': API_KEY,
                    },
                });

                if (!batchResponse.ok) {
                    const errorText = await batchResponse.text();
                    console.error(`[UPDATE PROPERTY STATUS] Batch API error on batch ${batchNum}: ${batchResponse.status} - ${errorText}`);
                    totalErrors += batch.length;
                    continue;
                }

                const batchResponseData = await batchResponse.json();

                if (!batchResponseData || !Array.isArray(batchResponseData)) {
                    console.warn(`[UPDATE PROPERTY STATUS] Invalid batch response format for batch ${batchNum}, skipping`);
                    totalErrors += batch.length;
                    continue;
                }

                // Step 4: Process each property in the batch response
                // The batch API returns items in the same order as input addresses
                const updatesToProcess: Array<{
                    propertyId: string;
                    newStatus: string;
                    newListingStatus: string;
                }> = [];

                for (let j = 0; j < batchResponseData.length && j < batch.length; j++) {
                    const batchItem = batchResponseData[j];
                    const property = batch[j];
                    const formattedAddress = formattedAddresses[j];

                    if (!property) {
                        console.warn(`[UPDATE PROPERTY STATUS] No property found for index ${j} in batch ${batchNum}`);
                        continue;
                    }

                    totalProcessed++;

                    // Skip items with errors or missing property data
                    if (batchItem.error || !batchItem.property) {
                        if (batchItem.error) {
                            console.warn(`[UPDATE PROPERTY STATUS] Error for property ${property.propertyId} (address: ${formattedAddress}): ${batchItem.error}`);
                        }
                        continue;
                    }

                    const propertyData = batchItem.property;
                    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();

                    // Map listing_status to status:
                    // - "On Market" → status = "on-market"
                    // - "Off Market" → status = "in-renovation"
                    let newStatus: string;
                    if (propertyListingStatus === "on market" || propertyListingStatus === "on_market") {
                        newStatus = "on-market";
                    } else {
                        // Default to "in-renovation" for "Off Market" or any other value
                        newStatus = "in-renovation";
                    }

                    // Store listingStatus as normalized value from API (on-market or off-market)
                    const newListingStatus = propertyListingStatus === "on market" || propertyListingStatus === "on_market" ? "on-market" : "off-market";

                    // Only update if status or listingStatus has changed
                    // This ensures we only update properties that actually have different values
                    if (property.currentStatus !== newStatus || property.currentListingStatus !== newListingStatus) {
                        updatesToProcess.push({
                            propertyId: property.propertyId,
                            newStatus,
                            newListingStatus,
                        });
                    } else {
                        // Property status hasn't changed - skip update (logged for debugging if needed)
                        // Uncomment below for verbose logging:
                        // console.log(`[UPDATE PROPERTY STATUS] Property ${property.propertyId} status unchanged (${property.currentStatus})`);
                    }
                }

                // Step 5: Batch update properties that have changed
                if (updatesToProcess.length > 0) {
                    console.log(`[UPDATE PROPERTY STATUS] Batch ${batchNum} (global ${globalBatchNum}): ${updatesToProcess.length} properties need updates`);

                    // Use batch update with SQL VALUES clause for efficiency
                    // This is much faster than individual updates, especially for larger batches
                    // Uses UPDATE FROM VALUES pattern which works without transactions
                    try {
                        // Build VALUES clause manually with proper SQL escaping
                        // Format: VALUES ('id1'::uuid, 'status1', 'listingStatus1'), ('id2'::uuid, 'status2', 'listingStatus2'), ...
                        const valuesStrings = updatesToProcess.map(update => {
                            // Escape single quotes in string values
                            const escapedStatus = update.newStatus.replace(/'/g, "''");
                            const escapedListingStatus = update.newListingStatus.replace(/'/g, "''");
                            // UUIDs must be quoted as strings before casting to uuid
                            return `('${update.propertyId}'::uuid, '${escapedStatus}', '${escapedListingStatus}')`;
                        });
                        const valuesClause = valuesStrings.join(', ');

                        // Execute batch update using UPDATE FROM VALUES
                        // This updates all properties in a single query (much faster than individual updates)
                        await db.execute(sql.raw(`
                            UPDATE properties
                            SET 
                                status = updates.status,
                                listing_status = updates.listing_status,
                                updated_at = now()
                            FROM (VALUES ${valuesClause}) AS updates(id, status, listing_status)
                            WHERE properties.id = updates.id
                        `));
                        
                        totalUpdated += updatesToProcess.length;
                        console.log(`[UPDATE PROPERTY STATUS] Batch ${batchNum}: Successfully batch updated ${updatesToProcess.length} properties`);
                    } catch (batchUpdateError: any) {
                        console.error(`[UPDATE PROPERTY STATUS] Error batch updating properties in batch ${batchNum}:`, batchUpdateError);
                        // Fallback: try updating individually to see which ones fail
                        console.log(`[UPDATE PROPERTY STATUS] Attempting individual updates for batch ${batchNum}...`);
                        for (const update of updatesToProcess) {
                            try {
                                await db
                                    .update(properties)
                                    .set({
                                        status: update.newStatus,
                                        listingStatus: update.newListingStatus,
                                        updatedAt: sql`now()`,
                                    })
                                    .where(eq(properties.id, update.propertyId));
                                
                                totalUpdated++;
                            } catch (individualError: any) {
                                console.error(`[UPDATE PROPERTY STATUS] Error updating property ${update.propertyId}:`, individualError);
                                totalErrors++;
                            }
                        }
                    }
                } else {
                    console.log(`[UPDATE PROPERTY STATUS] Batch ${batchNum} (global ${globalBatchNum}): No status changes detected`);
                }

            } catch (batchError: any) {
                console.error(`[UPDATE PROPERTY STATUS] Error processing batch ${batchNum}:`, batchError);
                totalErrors += batch.length;
                // Continue with next batch instead of failing completely
                continue;
            }

            // Rate limiting: Add delay between SFR API batches (except after the last batch)
            if (i + BATCH_SIZE < propertiesChunk.length) {
                await delay(RATE_LIMIT_DELAY_MS);
            }
            } // End of SFR batch loop
        } // End of cursor-based pagination loop

        console.log(`[UPDATE PROPERTY STATUS] Update complete: ${totalProcessed} processed, ${totalUpdated} updated, ${totalErrors} errors`);
        console.log(`[UPDATE PROPERTY STATUS] Summary: Checked ${totalProcessed} properties, updated ${totalUpdated} with status changes, ${totalProcessed - totalUpdated - totalErrors} had no changes`);
        
        // Verification: Check if we processed all expected properties
        if (totalProcessed < expectedTotalProcessed) {
            console.warn(`[UPDATE PROPERTY STATUS] WARNING: Expected to process ${expectedTotalProcessed} properties but only processed ${totalProcessed}. Some properties may have been skipped.`);
        } else if (totalProcessed > expectedTotalProcessed) {
            console.warn(`[UPDATE PROPERTY STATUS] WARNING: Processed ${totalProcessed} properties but expected ${expectedTotalProcessed}. Some properties may have been processed multiple times.`);
        } else {
            console.log(`[UPDATE PROPERTY STATUS] ✓ Verification: All ${expectedTotalProcessed} properties were processed exactly once`);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[UPDATE PROPERTY STATUS] Fatal error:`, errorMessage);
        throw error;
    }
}
