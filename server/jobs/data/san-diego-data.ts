import { syncMSAV2 } from "server/utils/dataSync";

const SAN_DIEGO_MSA = "San Diego-Chula Vista-Carlsbad, CA";
const CITY_CODE = "SD";

export async function syncSanDiegoData() {
    console.log(`[${CITY_CODE} SYNC] Syncing San Diego Data for MSA: ${SAN_DIEGO_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        const result = await syncMSAV2({
            msa: SAN_DIEGO_MSA,
            cityCode: CITY_CODE,
            API_KEY,
            API_URL,
            today,
            excludedAddresses: [],
        });

        console.log(`[${CITY_CODE} SYNC] Sync complete for ${SAN_DIEGO_MSA}: ${result.totalProcessed} processed, ${result.totalInserted} inserted, ${result.totalUpdated} updated`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${SAN_DIEGO_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}