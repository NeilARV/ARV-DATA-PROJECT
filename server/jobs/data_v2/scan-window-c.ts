import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { addDaysToYMD } from "server/utils/normalization";
import { getMarket } from "./processes/get-market";
import { cleanMarket } from "./processes/clean-market";
import { insertQueue } from "./processes/insert-queue";

const SCAN_WINDOW = "44-76d" as const;
const DAYS_BACK_MIN = 44;
const DAYS_BACK_MAX = 76;

/**
 * Scanner C — runs weekly (Sundays), covers 44-76 days ago.
 *
 * Overlaps with Scanner B on the 44-46 day range. Catches late-backfilled
 * records that SFR added after Scanners A and B already passed through
 * that date range. Weekly cadence is sufficient for this age of data.
 *
 * Iterates every MSA in the database so adding a new MSA row is all that's
 * needed to start scanning it — no code changes required.
 */
export async function scanWindowC(): Promise<void> {
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
