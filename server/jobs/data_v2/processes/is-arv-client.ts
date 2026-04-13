import { db } from "server/storage";
import { companies } from "@database/schemas/companies.schema";
import { inArray } from "drizzle-orm";
import type { PropertyWithStatus } from "./resolve-status";

const ARV_LENDER = "ARV FINANCE INC";

/**
 * Pipeline step: marks companies as ARV clients when they appear as buyer or
 * seller on an Arms Length transaction funded by ARV Finance Inc.
 *
 * Must run after insertProperties so that all transaction rows have resolved
 * buyer_id / seller_id UUIDs. Only Arms Length transactions are considered —
 * matching the same filter used by resolveArvFunded and isFinancedByARV in
 * properties.services.ts.
 */
export async function updateArvClientCompanies(
    properties: PropertyWithStatus[],
    cityCode: string
): Promise<void> {
    const arvClientIds = new Set<string>();

    for (const item of properties) {
        for (const tx of item.transactions ?? []) {
            const r = tx as Record<string, unknown>;

            const txType = ((r["TRANSACTION_TYPE"] ?? r["transaction_type"]) as string ?? "").trim().toLowerCase();
            if (txType !== "arms length") continue;

            const rawLender = r["FIRST_MTG_LENDER_NAME"] ?? r["first_mtg_lender_name"];
            const lender = rawLender != null && typeof rawLender === "string"
                ? rawLender.trim().toUpperCase()
                : "";
            if (lender !== ARV_LENDER) continue;

            if (tx.buyer_id) arvClientIds.add(tx.buyer_id);
            if (tx.seller_id) arvClientIds.add(tx.seller_id);
        }
    }

    if (arvClientIds.size === 0) return;

    await db
        .update(companies)
        .set({ isArvClient: true })
        .where(inArray(companies.id, Array.from(arvClientIds)));

    console.log(`[${cityCode}] Marked ${arvClientIds.size} compan${arvClientIds.size === 1 ? "y" : "ies"} as ARV clients`);
}
