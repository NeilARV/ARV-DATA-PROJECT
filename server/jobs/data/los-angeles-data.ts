import { syncMSA } from "server/routes/data.routes";

const LOS_ANGELES_MSA = "Los Angeles-Long Beach-Anaheim, CA";
const CITY_CODE = "LA";
// Excluded addresses - addresses to skip (case-insensitive matching)
const EXCLUDED_ADDRESSES = [
    "11011 Huston St",
    "11011 Houston St", // Also check for correct spelling
];

export async function syncLosAngelesData() {
    console.log(`[${CITY_CODE} SYNC] Syncing Los Angeles Data for MSA: ${LOS_ANGELES_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        // Call syncMSA - it handles all the sync logic internally, including sync state management
        // Pass excluded addresses to skip specific properties
        const result = await syncMSA(LOS_ANGELES_MSA, CITY_CODE, API_KEY, API_URL, today, EXCLUDED_ADDRESSES);

        console.log(`[${CITY_CODE} SYNC] Sync complete for ${LOS_ANGELES_MSA}: ${result.totalProcessed} processed, ${result.totalInserted} inserted, ${result.totalUpdated} updated, ${result.totalContactsAdded} contacts added`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${LOS_ANGELES_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}