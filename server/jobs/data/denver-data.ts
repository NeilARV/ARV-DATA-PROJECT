import { syncMSAV2 } from "server/utils/dataSync";
import { fetchMarket } from "./processes/fetch-market";
import { cleanMarket } from "./processes/clean-market";
import { insertCompanies } from "./processes/insert-companies";
import { batchLookup } from "./processes/batch-lookup";
import { resolvePropertyIds } from "./processes/resolve-ids";
import { getTransactions } from "./processes/get-transactions";
import { cleanTransactions } from "./processes/clean-transactions";

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

        // Fetch transaction history for each property (one API call per property)
        const propertiesWithTransactions = await getTransactions({
            properties: propertiesWithIds,
            API_KEY,
            API_URL,
            cityCode: CITY_CODE,
        });

        // Extract corporate company names from transaction history
        const transactionCompanies = cleanTransactions(propertiesWithTransactions);
        console.log(`[${CITY_CODE} SYNC] Companies from transactions (${transactionCompanies.companyNames.length}):`, transactionCompanies.companyNames);

        return { ...cleaned, ...insertResult, properties: propertiesWithTransactions };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${DENVER_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}