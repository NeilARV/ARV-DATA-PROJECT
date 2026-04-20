import { db } from "server/storage";
import { msas } from "@database/schemas/msas.schema";
import { addDaysToYMD } from "server/utils/normalization";
import { getMarket } from "./processes/get-market";
import { cleanMarket } from "./processes/clean-market";
import { insertQueue } from "./processes/insert-queue";
import type { MarketScanWindow } from "@database/types/sync";

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Set to the MSA name exactly as it appears in the msas table.
const MSA_NAME = "Tampa-St. Petersburg-Clearwater, FL";

// "test"  → scans only 0-30 days (windows A + B) — quick sanity check
// "full"  → scans all 0-180 days (windows A–E)   — production backfill
const MODE: "test" | "full" = "full";
// ─────────────────────────────────────────────────────────────────────────────

type WindowDef = {
    label: MarketScanWindow;
    daysMin: number; // saleDateMax = today - daysMin
    daysMax: number; // saleDateMin = today - daysMax
};

const ALL_WINDOWS: WindowDef[] = [
    { label: "0-15d",    daysMin: 0,   daysMax: 15  },
    { label: "15-30d",   daysMin: 15,  daysMax: 30  },
    { label: "30-60d",   daysMin: 30,  daysMax: 60  },
    { label: "60-90d",   daysMin: 60,  daysMax: 90  },
    { label: "90-180d",  daysMin: 90,  daysMax: 180 },
];

const TEST_WINDOWS: WindowDef[] = ALL_WINDOWS.slice(0, 2); // A + B only

/**
 * Init scanner — runs all scan windows for a single hardcoded MSA.
 *
 * Designed for the initial population of a new MSA without triggering
 * scans across all existing MSAs. Change MSA_NAME and MODE at the top
 * of this file, then trigger via the cron entry in jobs/index.ts.
 *
 * After the backfill is complete, comment out the cron entry and reset
 * MODE to "test" so a stray trigger doesn't re-run the full scan.
 */
export async function scanWindowInit(): Promise<void> {
    const API_KEY = process.env.SFR_API_KEY!;
    const API_URL = process.env.SFR_API_URL!;

    const windows = MODE === "full" ? ALL_WINDOWS : TEST_WINDOWS;
    const today = new Date().toISOString().split("T")[0];

    console.log(`[SCAN:INIT] Starting — MSA: "${MSA_NAME}", mode: ${MODE} (${windows.length} window(s))`);

    // Resolve the MSA row so we have a valid msaId for insertQueue
    const [msa] = await db.select().from(msas).where(
        (await import("drizzle-orm")).eq(msas.name, MSA_NAME)
    );

    if (!msa) {
        console.error(`[SCAN:INIT] MSA "${MSA_NAME}" not found in database — aborting`);
        return;
    }

    const totals = { fetched: 0, kept: 0, inserted: 0, skipped: 0 };

    for (const win of windows) {
        const saleDateMin = addDaysToYMD(today, -win.daysMax);
        const saleDateMax = win.daysMin === 0 ? today : addDaysToYMD(today, -win.daysMin);

        console.log(`[SCAN:INIT][${win.label}] Date range: ${saleDateMin} → ${saleDateMax}`);

        try {
            const { records, totalFetched } = await getMarket({
                msaName: msa.name,
                scanWindow: win.label,
                API_KEY,
                API_URL,
                saleDateMin,
                saleDateMax,
            });

            const { records: filtered, stats } = cleanMarket(records, win.label, msa.name);

            const result = await insertQueue({
                records: filtered,
                msaId: msa.id,
                scanWindow: win.label,
                msaName: msa.name,
            });

            totals.fetched += totalFetched;
            totals.kept += stats.kept;
            totals.inserted += result.inserted;
            totals.skipped += result.skipped;

            console.log(
                `[SCAN:INIT][${win.label}] Done — ` +
                `fetched: ${totalFetched}, kept: ${stats.kept}, ` +
                `inserted: ${result.inserted}, skipped: ${result.skipped}`
            );
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[SCAN:INIT][${win.label}] Failed:`, msg);
            // Continue to next window — a partial backfill is better than none
        }
    }

    console.log(
        `[SCAN:INIT] Complete — ` +
        `fetched: ${totals.fetched}, kept: ${totals.kept}, ` +
        `inserted: ${totals.inserted} new, ${totals.skipped} already existed`
    );
}
