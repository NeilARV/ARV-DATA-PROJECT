import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { addDaysToYMD } from "server/utils/normalization";
import { getMarket } from "./processes/get-market";
import { cleanMarket } from "./processes/clean-market";
import { insertQueue } from "./processes/insert-queue";

const SCAN_WINDOW = "74-91d" as const;
const DAYS_BACK_MIN = 74;
const DAYS_BACK_MAX = 91;

/**
 * Scanner D — runs bi-weekly (1st and 15th of each month), covers 74-91 days ago.
 *
 * This is the tail window — the oldest data we scan. Overlaps with Scanner C
 * on the 74-76 day range. Bi-weekly cadence handles the rare case of SFR
 * backfilling records that are 2-3 months old. Beyond 91 days we stop scanning.
 *
 * Iterates every MSA in the database so adding a new MSA row is all that's
 * needed to start scanning it — no code changes required.
 */
export async function scanWindowD(): Promise<void> {
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;

    const today = new Date().toISOString().split("T")[0];
    const saleDateMin = addDaysToYMD(today, -DAYS_BACK_MAX);
    const saleDateMax = addDaysToYMD(today, -DAYS_BACK_MIN);

    console.log(`[SCAN:${SCAN_WINDOW}] Starting — date range: ${saleDateMin} → ${saleDateMax}`);

    const allMsas = await db.select().from(msas);

    if (allMsas.length === 0) {
        console.warn(`[SCAN:${SCAN_WINDOW}] No MSAs in database, aborting`);
        return;
    }

    console.log(`[SCAN:${SCAN_WINDOW}] Scanning ${allMsas.length} MSA(s)`);

    const totals = { fetched: 0, kept: 0, inserted: 0, skipped: 0 };

    for (const msa of allMsas) {
        try {
            const { records, totalFetched } = await getMarket({
                msaName: msa.name,
                scanWindow: SCAN_WINDOW,
                API_KEY,
                API_URL,
                saleDateMin,
                saleDateMax,
            });

            const { records: filtered, stats } = cleanMarket(records, SCAN_WINDOW, msa.name);

            const result = await insertQueue({
                records: filtered,
                msaId: msa.id,
                scanWindow: SCAN_WINDOW,
                msaName: msa.name,
            });

            totals.fetched += totalFetched;
            totals.kept += stats.kept;
            totals.inserted += result.inserted;
            totals.skipped += result.skipped;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[SCAN:${SCAN_WINDOW}][${msa.name}] Failed:`, msg);
        }
    }

    console.log(
        `[SCAN:${SCAN_WINDOW}] Complete — ` +
        `fetched: ${totals.fetched}, kept: ${totals.kept}, ` +
        `inserted: ${totals.inserted} new, ${totals.skipped} already existed`
    );
}
