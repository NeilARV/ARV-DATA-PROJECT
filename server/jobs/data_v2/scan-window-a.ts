import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { addDaysToYMD } from "server/utils/normalization";
import { getMarket } from "./processes/get-market";
import { cleanMarket } from "./processes/clean-market";
import { insertQueue } from "./processes/insert-queue";

const SCAN_WINDOW = "0-15d" as const;
const DAYS_BACK = 15;

/**
 * Scanner A — runs nightly at midnight, covers the past 0-15 days.
 *
 * This is the primary ingestion window. Most new SFR recordings land here
 * (SFR typically has no data for the past ~7 days, but we scan from today
 * so those pages return empty quickly at no real cost).
 *
 * Iterates every MSA in the database so adding a new MSA row is all that's
 * needed to start scanning it — no code changes required.
 */
export async function scanWindowA(): Promise<void> {
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;

    const today = new Date().toISOString().split("T")[0];
    const saleDateMin = addDaysToYMD(today, -DAYS_BACK);
    const saleDateMax = today;

    console.log(`[SCAN:${SCAN_WINDOW}] Starting — date range: ${saleDateMin} → ${saleDateMax}`);

    // Load all active MSAs — no hardcoded list, new MSAs picked up automatically
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
            // Log and continue — one MSA failure should not abort the others
        }
    }

    console.log(
        `[SCAN:${SCAN_WINDOW}] Complete — ` +
        `fetched: ${totals.fetched}, kept: ${totals.kept}, ` +
        `inserted: ${totals.inserted} new, ${totals.skipped} already existed`
    );
}
