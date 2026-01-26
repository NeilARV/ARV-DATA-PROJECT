import { syncMSA } from "server/routes/data.routes";

const SAN_DIEGO_MSA = "San Diego-Chula Vista-Carlsbad, CA";
const CITY_CODE = "SD";

export async function syncSanDiegoData() {
    console.log(`[${CITY_CODE} SYNC] Syncing San Diego Data for MSA: ${SAN_DIEGO_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        // Call syncMSA - it handles all the sync logic internally, including sync state management
        const result = await syncMSA(SAN_DIEGO_MSA, CITY_CODE, API_KEY, API_URL, today);

        console.log(`[SD SYNC] Sync complete for ${SAN_DIEGO_MSA}: ${result.totalProcessed} processed, ${result.totalInserted} inserted, ${result.totalUpdated} updated, ${result.totalContactsAdded} contacts added`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[SD SYNC] Fatal error syncing ${SAN_DIEGO_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}