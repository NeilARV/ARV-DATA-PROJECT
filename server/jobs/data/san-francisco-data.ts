import { syncMSAV2 } from "server/utils/dataSync";

const SF_MSA = "San Francisco-Oakland-Fremont, CA";
const CITY_CODE = "SF";

export async function syncSanFranciscoData() {
    console.log(`[${CITY_CODE} SYNC] Syncing San Francisco Data for MSA: ${SF_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        const result = await syncMSAV2({
            msa: SF_MSA,
            cityCode: CITY_CODE,
            API_KEY,
            API_URL,
            today,
            excludedAddresses: [],
        });

        console.log(`[${CITY_CODE} SYNC] Sync complete for ${SF_MSA}: ${result.totalProcessed} processed, ${result.totalInserted} inserted, ${result.totalUpdated} updated`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${SF_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}