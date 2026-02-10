// import { syncMSAV2 } from "server/utils/dataSync";
import { dataSyncV3 } from "server/utils/dataSyncV3";

const DENVER_MSA = "Denver-Aurora-Centennial, CO";
const CITY_CODE = "DEN";

export async function syncDenverData() {
    console.log(`[${CITY_CODE} SYNC] Syncing Denver Data for MSA: ${DENVER_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        const result = await dataSyncV3({
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
            API_KEY,
            API_URL,
            today,
            excludedAddresses: [],
        });

        console.log(`[${CITY_CODE} SYNC] Sync complete for ${DENVER_MSA}`);

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${DENVER_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}