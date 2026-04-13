import type { PropertyWithStatus } from "./resolve-status";
import type { TransactionWithIds } from "./resolve-ids";

const ARV_LENDER = "ARV FINANCE INC";

function getTxStr(r: Record<string, unknown>, upper: string, lower: string): string {
    const v = r[upper] ?? r[lower];
    return v != null && typeof v === "string" ? v.trim() : "";
}

/**
 * Returns true if the most recent Arms Length transaction for this property
 * was funded by ARV Finance Inc.
 *
 * Only Arms Length transactions are considered — REFIs, HELOCs, and Non-Arms
 * Length transfers can have later recording dates but do not represent an
 * acquisition, so they would produce the wrong answer if included.
 */
function isArvFunded(transactions: TransactionWithIds[]): boolean {
    if (transactions.length === 0) return false;

    const armsLength = transactions.filter((tx) =>
        getTxStr(tx as Record<string, unknown>, "TRANSACTION_TYPE", "transaction_type").toLowerCase() === "arms length"
    );

    if (armsLength.length === 0) return false;

    let latestDate = "";
    let latestLender = "";

    for (const tx of armsLength) {
        const r = tx as Record<string, unknown>;
        const recDate = getTxStr(r, "RECORDING_DATE", "recording_date");
        if (!recDate || recDate <= latestDate) continue;
        latestDate = recDate;
        latestLender = getTxStr(r, "FIRST_MTG_LENDER_NAME", "first_mtg_lender_name").toUpperCase();
    }

    return latestLender === ARV_LENDER;
}

/**
 * Pipeline step: annotates each property with is_arv_funded.
 * Pure function — no DB calls.
 *
 * Run after cleanBeforeInsert, before insertProperties, so the flag is
 * available when mapPropertyRow writes it to the DB.
 */
export function resolveArvFunded(properties: PropertyWithStatus[]): PropertyWithStatus[] {
    return properties.map((item) => {
        const transactions = (item.transactions ?? []) as TransactionWithIds[];
        const property = { ...item.property } as Record<string, unknown>;
        property.is_arv_funded = isArvFunded(transactions);
        return {
            ...item,
            property: property as PropertyWithStatus["property"],
        };
    });
}
