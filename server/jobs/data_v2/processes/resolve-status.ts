import { normalizeDateToYMD } from "server/utils/normalization";
import { isFlippingCompany } from "server/utils/dataSyncHelpers";
import type { PropertyWithIds, TransactionWithIds } from "./resolve-ids";

export type PropertyStatus = "on-market" | "in-renovation" | "sold" | "wholesale";

/**
 * Extends PropertyWithIds with a resolved statuses array (multi-status).
 * `property.status` is also set to statuses[0] for backward compat with
 * cleanBeforeInsert and insert-properties (v1 shared functions).
 */
export interface PropertyWithStatuses extends PropertyWithIds {
    statuses: PropertyStatus[];
    property: PropertyWithIds["property"] & { status: PropertyStatus };
}

/** Alias for clean-before-insert and insert-properties. */
export type PropertyWithStatus = PropertyWithStatuses;

const WHOLESALE_DAYS_THRESHOLD = 30;

function getString(obj: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
        const v = obj[k];
        if (v != null && typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

function getDate(tx: Record<string, unknown>, ...keys: string[]): string | null {
    for (const k of keys) {
        const raw = getString(tx, k);
        if (raw) {
            const normalized = normalizeDateToYMD(raw);
            if (normalized) return normalized;
        }
    }
    return null;
}

/** Arms Length transactions only — REFIs, HELOCs, Non-Arms Length etc. are excluded. */
function isArmsLength(tx: Record<string, unknown>): boolean {
    return getString(tx, "TRANSACTION_TYPE", "transaction_type").toLowerCase() === "arms length";
}

/**
 * Sorts Arms Length transactions most-recent-first using:
 *   1. recording_date DESC
 *   2. Chain detection (same recording_date) — if buyerName(txB) === sellerName(txA) then
 *      txA is the resale (more recent); txA cannot sell before txB buys.
 *   3. sale_date DESC (if chain detection is inconclusive)
 *   4. Original array order (stable fallback)
 *
 * Chain detection is promoted above sale_date because simultaneous-close wholesale
 * transactions (e.g., ORCA ← SD VREV ← VIRGILIO, all recorded the same day) can have
 * SALE_DATE values that reflect contract signing order rather than true deal chronology,
 * causing sale_date-first ordering to pick the wrong "most recent" transaction.
 */
function sortArmsLengthDesc(txs: TransactionWithIds[]): TransactionWithIds[] {
    const filtered = txs.filter((tx) => isArmsLength(tx as Record<string, unknown>));
    if (filtered.length <= 1) return filtered;

    return [...filtered].sort((a, b) => {
        const ar = a as Record<string, unknown>;
        const br = b as Record<string, unknown>;

        // 1. recording_date DESC
        const recA = getDate(ar, "RECORDING_DATE", "recording_date");
        const recB = getDate(br, "RECORDING_DATE", "recording_date");
        if (recA && recB) {
            if (recA > recB) return -1;
            if (recA < recB) return 1;
        } else if (recA) {
            return -1;
        } else if (recB) {
            return 1;
        }

        // 2. Chain detection (same recording_date)
        // If txB's buyer is txA's seller → txB is the purchase, txA is the resale → txA is more recent
        const buyerA = getString(ar, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
        const sellerA = getString(ar, "SELLER1_NAME", "seller1_name");
        const buyerB = getString(br, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
        const sellerB = getString(br, "SELLER1_NAME", "seller1_name");

        if (buyerB && sellerA && buyerB === sellerA) return -1; // txA is the resale → more recent
        if (buyerA && sellerB && buyerA === sellerB) return 1;  // txB is the resale → more recent

        // 3. sale_date DESC
        const saleA = getDate(ar, "SALE_DATE", "sale_date");
        const saleB = getDate(br, "SALE_DATE", "sale_date");
        if (saleA && saleB) {
            if (saleA > saleB) return -1;
            if (saleA < saleB) return 1;
        }

        return 0; // preserve original order
    });
}

/**
 * Resolves property statuses using the transaction history and SFR listing_status.
 *
 * Status rules:
 *   on-market   — listing_status is "On Market"
 *   wholesale   — off-market, most recent Arms Length seller is buyer on a prior
 *                 Arms Length tx, holding period ≤ 30 days, and BOTH buyer and
 *                 seller on the most recent tx are corporate non-trusts
 *   sold        — off-market, most recent Arms Length seller is corporate non-trust,
 *                 buyer is NOT corporate (individual or non-entity)
 *   in-renovation — off-market, most recent Arms Length buyer is corporate non-trust
 *
 * Possible combinations:
 *   - on-market alone (mutually exclusive with off-market statuses)
 *   - wholesale + in-renovation (always together — wholesale requires corporate buyer)
 *   - sold alone
 *   - in-renovation alone
 *
 * `property.status` is set to statuses[0] for backward compat with shared v1
 * helpers (cleanBeforeInsert, insertProperties).
 */
export function resolveStatuses(
    properties: PropertyWithIds[],
    cityCode: string
): PropertyWithStatuses[] {
    const label = `[RESOLVE_STATUS][${cityCode}]`;

    return properties.map((item) => {
        const property = { ...item.property } as Record<string, unknown>;
        const allTxs = ((item.transactions ?? []) as unknown[]) as TransactionWithIds[];

        const listingStatus = getString(property, "listing_status", "listingStatus");
        const sorted = sortArmsLengthDesc(allTxs);
        const mostRecent = sorted[0] ?? null;
        const mostRecentRaw = mostRecent as (TransactionWithIds & Record<string, unknown>) | null;

        const statuses: PropertyStatus[] = [];

        if (listingStatus === "On Market") {
            statuses.push("on-market");
        } else {
            // Off Market (or unrecognized listing_status → treat as off-market)
            if (!mostRecentRaw) {
                // No Arms Length transaction history — fall back to property-level buyer_id
                const propertyBuyerId = property.buyer_id;
                if (propertyBuyerId) {
                    statuses.push("in-renovation");
                }
            } else {
                const buyerName = getString(mostRecentRaw, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
                const sellerName = getString(mostRecentRaw, "SELLER1_NAME", "seller1_name");
                const sellerId = mostRecentRaw.seller_id ?? null;

                const buyerIsCorp = isFlippingCompany(buyerName, null);
                const sellerIsCorp = isFlippingCompany(sellerName, null);

                // ── Wholesale check ─────────────────────────────────────────
                if (buyerIsCorp && sellerIsCorp) {
                    const mostRecentRecDate = getDate(mostRecentRaw, "RECORDING_DATE", "recording_date");
                    if (mostRecentRecDate) {
                        // Find the previous Arms Length tx where the seller (on mostRecent) was the buyer
                        const sellerAcquisition = sorted.slice(1).find((tx) => {
                            const txRaw = tx as Record<string, unknown>;
                            const txBuyerName = getString(txRaw, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
                            const txBuyerId = (tx as TransactionWithIds).buyer_id ?? null;
                            const txRecDate = getDate(txRaw, "RECORDING_DATE", "recording_date");
                            if (!txRecDate) return false;
                            const matchById = !!(sellerId && txBuyerId && sellerId === txBuyerId);
                            const matchByName = !!(sellerName && txBuyerName && sellerName === txBuyerName);
                            return matchById || matchByName;
                        });

                        if (sellerAcquisition) {
                            const acquisitionDate = getDate(
                                sellerAcquisition as Record<string, unknown>,
                                "RECORDING_DATE", "recording_date"
                            )!;
                            const daysHeld = Math.floor(
                                (new Date(mostRecentRecDate).setHours(0, 0, 0, 0) -
                                    new Date(acquisitionDate).setHours(0, 0, 0, 0)) /
                                (1000 * 60 * 60 * 24)
                            );
                            if (daysHeld <= WHOLESALE_DAYS_THRESHOLD) {
                                statuses.push("wholesale");
                            }
                        }
                    }
                }

                // ── Sold check ───────────────────────────────────────────────
                if (sellerIsCorp && !buyerIsCorp) {
                    statuses.push("sold");
                }

                // ── In-renovation check ──────────────────────────────────────
                if (buyerIsCorp) {
                    statuses.push("in-renovation");
                }
            }
        }

        // Default: if no statuses resolved, log and skip (caller handles display fallback)
        if (statuses.length === 0) {
            console.log(`${label} No status resolved for property ${property.property_id ?? "unknown"} — buyer/seller are both non-corporate`);
        }

        // Write canonical buyer/seller from most recent tx back onto the property object
        if (mostRecentRaw) {
            property.buyer_id = mostRecentRaw.buyer_id ?? null;
            property.seller_id = mostRecentRaw.seller_id ?? null;
            const buyerName = getString(mostRecentRaw, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
            const sellerName = getString(mostRecentRaw, "SELLER1_NAME", "seller1_name");
            const cs = (property.current_sale as Record<string, unknown>) ?? {};
            property.current_sale = { ...cs, buyer_1: buyerName, seller_1: sellerName };
        }

        // Set property.status to statuses[0] for backward compat with shared v1 helpers
        const primaryStatus: PropertyStatus = statuses[0] ?? "in-renovation";
        property.status = primaryStatus;

        return {
            ...item,
            property: property as PropertyWithStatuses["property"],
            statuses,
        };
    });
}
