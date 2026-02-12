import { syncMSAV2 } from "server/utils/dataSync";
import { fetchMarket } from "./processes/fetch-market";
import { cleanMarket } from "./processes/clean-market";

const DENVER_MSA = "Denver-Aurora-Centennial, CO";
const CITY_CODE = "DEN";

export async function syncDenverData() {
    console.log(`[${CITY_CODE} SYNC] Syncing Denver Data for MSA: ${DENVER_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {

        const raw = await fetchMarket({
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
            API_KEY,
            API_URL,
            today,
            excludedAddresses: [],
        });

        console.log(`[${CITY_CODE} SYNC] Fetch market complete for ${DENVER_MSA}: ${raw.records.length} records`);

        const cleaned = cleanMarket(raw);
        console.log(
            `[${CITY_CODE} SYNC] Cleaned market: ${cleaned.stats.kept} kept, ${cleaned.stats.removed} removed (${cleaned.stats.total} total)`
        );

        return cleaned;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${DENVER_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}