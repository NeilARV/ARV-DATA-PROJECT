import { syncMSAV2 } from "server/utils/dataSync";
import { fetchMarket } from "./processes/fetch-market";
import { cleanMarket } from "./processes/clean-market";
import { insertCompanies } from "./processes/insert-companies";
import { batchLookup } from "./processes/batch-lookup";
import { resolvePropertyIds } from "./processes/resolve-ids";

const DENVER_MSA = "Denver-Aurora-Centennial, CO";
const CITY_CODE = "DEN";

export async function syncDenverData() {
    console.log(`[${CITY_CODE} SYNC] Syncing Denver Data for MSA: ${DENVER_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {

        // Retrieve Buyer Market Data
        const raw = await fetchMarket({
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
            API_KEY,
            API_URL,
            today,
            excludedAddresses: [],
        });
        console.log(`[${CITY_CODE} SYNC] Fetch market complete for ${DENVER_MSA}: ${raw.records.length} records`);

        // Clean Buyer Market Data
        const cleaned = cleanMarket(raw);
        console.log(`[${CITY_CODE} SYNC] Cleaned market: ${cleaned.stats.kept} kept, ${cleaned.stats.removed} removed (${cleaned.stats.total} total)`);

        // Insert Companies Retrieved from Buyer Market Data
        const insertResult = await insertCompanies({
            companyNames: cleaned.companyNames,
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
        });

        // Batch lookup properties and merge with buyers/market data
        const properties = await batchLookup({
            records: cleaned.records,
            API_KEY,
            API_URL,
            cityCode: CITY_CODE,
        });

        // Resolve buyer_id and seller_id from companies table
        const propertiesWithIds = await resolvePropertyIds({
            properties,
            cityCode: CITY_CODE,
        });

        // Log 2 sample properties after resolvePropertyIds for inspection
        const samples = propertiesWithIds.slice(0, 2);
        console.log(`[${CITY_CODE} SYNC] Sample properties after resolvePropertyIds (${samples.length} of ${propertiesWithIds.length}):`);
        samples.forEach((p, i) => {
            console.log(`[${CITY_CODE} SYNC] --- Property ${i + 1} ---`);
            console.log(JSON.stringify(p, null, 2));
        });

        return { ...cleaned, ...insertResult, properties: propertiesWithIds };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${DENVER_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}