import { syncMSAV2 } from "server/utils/dataSync";
import { fetchMarket } from "./processes/fetch-market";
import { cleanMarket } from "./processes/clean-market";
import { insertCompanies } from "./processes/insert-companies";
import { batchLookup } from "./processes/batch-lookup";
import { resolvePropertyIds } from "./processes/resolve-ids";
import { resolveStatus } from "./processes/resolve-status";
import { cleanBeforeInsert } from "./processes/clean-before-insert";
import { insertProperties } from "./processes/insert-properties";
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

        // Clean Buyer Market Data
        const cleaned = cleanMarket(raw, CITY_CODE);

        // Batch lookup properties and merge with buyers/market data
        const properties = await batchLookup({
            records: cleaned.records,
            API_KEY,
            API_URL,
            cityCode: CITY_CODE,
        });

        // Fetch transaction history for each property and add to property array
        const propertiesWithTransactions = await getTransactions({
            properties,
            API_KEY,
            API_URL,
            cityCode: CITY_CODE,
        });

        // Ensure each property has the buyer sale in transactions, then extract company names
        const transactionCompanies = cleanTransactions(propertiesWithTransactions, cleaned, CITY_CODE);
        

        const insertResult = await insertCompanies({
            companyNames: transactionCompanies.companyNames,
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
        });

        // Resolve buyer_id and seller_id from companies table
        const propertiesWithIds = await resolvePropertyIds({
            properties: propertiesWithTransactions,
            cityCode: CITY_CODE,
        });

        // Resolve status (on-market, in-renovation, sold, wholesale)
        const propertiesWithStatus = resolveStatus(propertiesWithIds, CITY_CODE);

        // Last-mile cleanup (e.g. county: "Los Angeles" not "Los Angeles County")
        const propertiesToInsert = cleanBeforeInsert(propertiesWithStatus);

        // Insert properties, addresses, and transactions into the database
        const insertPropertiesResult = await insertProperties({
            properties: propertiesToInsert,
            msa: DENVER_MSA,
            cityCode: CITY_CODE,
        });

        console.log(`[${CITY_CODE} SYNC] Complete Syncing Denver Data for MSA: ${DENVER_MSA}`);

        return {
            ...cleaned,
            ...insertResult,
            ...insertPropertiesResult,
            properties: propertiesWithStatus,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${DENVER_MSA}:`, errorMessage);
        throw error; // Re-throw so the scheduler can handle it
    }
}