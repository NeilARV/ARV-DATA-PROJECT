import { fetchMarket } from "./processes/fetch-market";
import { fetchLastSaleDate } from "./processes/fetch-date";
import { updateLastSaleDate } from "./processes/update-date";
import { cleanMarket } from "./processes/clean-market";
import { insertCompanies } from "./processes/insert-companies";
import { batchLookup } from "./processes/batch-lookup";
import { resolvePropertyIds } from "./processes/resolve-ids";
import { resolveStatus } from "./processes/resolve-status";
import { cleanBeforeInsert } from "./processes/clean-before-insert";
import { insertProperties } from "./processes/insert-properties";
import { getTransactions } from "./processes/get-transactions";
import { cleanTransactions } from "./processes/clean-transactions";
import { addDaysToYMD } from "server/utils/normalization";

const LOS_ANGELES_MSA = "Los Angeles-Long Beach-Anaheim, CA";
const CITY_CODE = "LA";

// Excluded addresses - addresses to skip (case-insensitive matching)
const EXCLUDED_ADDRESSES = [
    "11011 Huston St",
];

export async function syncLosAngelesData() {
    console.log(`[${CITY_CODE} SYNC] Syncing Denver Data for MSA: ${LOS_ANGELES_MSA}`);

    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;
    const today = new Date().toISOString().split("T")[0];

    try {
        let lastSaleDate: string | null = await fetchLastSaleDate(LOS_ANGELES_MSA);
        
        if (lastSaleDate == null) {
            throw new Error(`[${CITY_CODE} SYNC] Cannot get last sale date for MSA: ${LOS_ANGELES_MSA}; sync aborted.`);
        }

        /** Sale date of the last property we successfully processed; persisted only at end of run. */
        let lastSuccessfulSaleDate: string | null = null;

        const aggregated = {
            totalRecords: 0,
            companiesInserted: 0,
            propertiesInserted: 0,
        };

        while (true) {
            if (lastSaleDate >= today) {
                console.log(`[${CITY_CODE} SYNC] Caught up to today (${today}), stopping.`);
                break;
            }

            const saleDateMax = addDaysToYMD(lastSaleDate, 1);

            const raw = await fetchMarket({
                msa: LOS_ANGELES_MSA,
        cityCode: CITY_CODE,
        API_KEY,
        API_URL,
        saleDateMin: lastSaleDate,
        saleDateMax,
        excludedAddresses: EXCLUDED_ADDRESSES,
    });

            if (raw.records.length === 0) {
                console.log(
                    `[${CITY_CODE} SYNC] No properties for ${lastSaleDate}; skipping to next date.`
                );
                lastSaleDate = saleDateMax;
                continue;
            }

            const cleaned = cleanMarket(raw, CITY_CODE);

            const properties = await batchLookup({
                records: cleaned.records,
                API_KEY,
                API_URL,
                cityCode: CITY_CODE,
            });

            const propertiesWithTransactions = await getTransactions({
                properties,
                API_KEY,
                API_URL,
                cityCode: CITY_CODE,
            });

            const transactionCompanies = cleanTransactions(
                propertiesWithTransactions,
                cleaned,
                CITY_CODE
            );

            const insertResult = await insertCompanies({
                companyNames: transactionCompanies.companyNames,
                msa: LOS_ANGELES_MSA,
                cityCode: CITY_CODE,
                companyCounties: transactionCompanies.companyCounties,
            });

            const propertiesWithIds = await resolvePropertyIds({
                properties: propertiesWithTransactions,
                cityCode: CITY_CODE,
            });

            const propertiesWithStatus = resolveStatus(propertiesWithIds, CITY_CODE);
            const propertiesToInsert = cleanBeforeInsert(propertiesWithStatus);

            const insertPropertiesResult = await insertProperties({
                properties: propertiesToInsert,
                msa: LOS_ANGELES_MSA,
                cityCode: CITY_CODE,
            });

            if (raw.lastSaleDate) {
                lastSuccessfulSaleDate = raw.lastSaleDate;
            }

            aggregated.totalRecords += raw.records.length;
            aggregated.companiesInserted += insertResult.companiesInserted ?? 0;
            aggregated.propertiesInserted += insertPropertiesResult.propertiesInserted ?? 0;

            lastSaleDate = saleDateMax;
        }

        if (lastSuccessfulSaleDate !== null) {
            const storedDate = addDaysToYMD(lastSuccessfulSaleDate, -1);
            await updateLastSaleDate(LOS_ANGELES_MSA, CITY_CODE, storedDate);
        }

        console.log(
            `[${CITY_CODE} SYNC] Complete Syncing Denver Data for MSA: ${LOS_ANGELES_MSA} ` +
                `(records: ${aggregated.totalRecords}, companies: ${aggregated.companiesInserted}, properties: ${aggregated.propertiesInserted})`
        );

        return aggregated;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${CITY_CODE} SYNC] Fatal error syncing ${LOS_ANGELES_MSA}:`, errorMessage);
        throw error;
    }
}