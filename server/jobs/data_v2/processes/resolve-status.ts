import { normalizeDateToYMD } from 'server/utils/normalization';
import { isFlippingCompany } from 'server/utils/dataSyncHelpers';
import {
    sortTransactionsDesc,
    isArmsLength,
    buyerTokens,
    sellerTokens,
    intersects,
} from 'server/utils/orderTransactions';
import type { PropertyWithIds, TransactionWithIds } from './resolve-ids';
import type { PropertyStatus } from '@shared/types/properties';

/**
 * Extends PropertyWithIds with a resolved statuses array (multi-status).
 * `property.status` is also set to statuses[0] for backward compat with
 * cleanBeforeInsert and insert-properties (v1 shared functions).
 */
interface PropertyWithStatuses extends PropertyWithIds {
    statuses: PropertyStatus[];
    property: PropertyWithIds['property'] & { status: PropertyStatus };
}

/** Alias for clean-before-insert and insert-properties. */
export type PropertyWithStatus = PropertyWithStatuses;

const WHOLESALE_DAYS_THRESHOLD = 30;

function getString(obj: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
        const v = obj[k];
        if (v != null && typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
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

/** DST-safe whole-day difference between two YYYY-MM-DD strings (null if unparseable). */
function daysBetweenUTC(laterYmd: string | null, earlierYmd: string | null): number | null {
    const a = ymdToUTC(laterYmd);
    const b = ymdToUTC(earlierYmd);
    if (a === null || b === null) return null;
    return Math.round((a - b) / 86_400_000);
}

function ymdToUTC(ymd: string | null): number | null {
    if (!ymd) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** True if EITHER borrower on the tx is a corporate (non-trust) flipping company. */
function buyerSideIsCorporate(tx: Record<string, unknown>): boolean {
    return (
        isFlippingCompany(getString(tx, 'BUYER_BORROWER1_NAME', 'buyer_borrower1_name'), null) ||
        isFlippingCompany(getString(tx, 'BUYER_BORROWER2_NAME', 'buyer_borrower2_name'), null)
    );
}

/** True if EITHER seller on the tx is a corporate (non-trust) flipping company. */
function sellerSideIsCorporate(tx: Record<string, unknown>): boolean {
    return (
        isFlippingCompany(getString(tx, 'SELLER1_NAME', 'seller1_name'), null) ||
        isFlippingCompany(getString(tx, 'SELLER2_NAME', 'seller2_name'), null)
    );
}

/**
 * Resolves property statuses using the transaction history and SFR listing_status.
 *
 * Transactions are ordered most-recent-first by the shared chain-reconstruction sort
 * (sortTransactionsDesc), then filtered to Arms Length — so status uses the SAME
 * ordering as the persisted/display layer, with chain links resolved through any
 * intervening Non-Arms Length transfers and borrower-2 / company-id matches.
 *
 * Status rules:
 *   on-market   — listing_status is "On Market" (currently mapped to in-renovation)
 *   wholesale   — off-market, most recent Arms Length is corporate→corporate, the
 *                 seller acquired it on a prior Arms Length tx, holding period 0–30 days
 *   sold        — off-market, most recent Arms Length seller is corporate, buyer is NOT
 *   in-renovation — off-market, most recent Arms Length buyer is corporate
 *
 * `property.status` is set to statuses[0] for backward compat with shared v1
 * helpers (cleanBeforeInsert, insertProperties).
 */
export function resolveStatuses(
    properties: PropertyWithIds[],
    cityCode: string,
): PropertyWithStatuses[] {
    const label = `[RESOLVE_STATUS][${cityCode}]`;

    return properties.map((item) => {
        const property = { ...item.property } as Record<string, unknown>;
        const allTxs = (item.transactions ?? []) as unknown[] as TransactionWithIds[];

        const listingStatus = getString(property, 'listing_status', 'listingStatus');
        const sorted = sortTransactionsDesc(allTxs).filter((tx) =>
            isArmsLength(tx as Record<string, unknown>),
        );
        const mostRecent = sorted[0] ?? null;
        const mostRecentRaw = mostRecent as (TransactionWithIds & Record<string, unknown>) | null;

        const statuses: PropertyStatus[] = [];

        // On-market data unreliable — treat on-market listings as in-renovation instead.
        // To restore: replace the in-renovation push below with statuses.push("on-market") and remove the else-if.
        if (listingStatus === 'On Market') {
            // statuses.push("on-market"); // original: disabled until on-market data is reliable
            statuses.push('in-renovation');
        } else {
            // Off Market (or unrecognized listing_status → treat as off-market)
            if (!mostRecentRaw) {
                // No Arms Length transaction history — fall back to property-level buyer_id
                const propertyBuyerId = property.buyer_id;
                if (propertyBuyerId) {
                    statuses.push('in-renovation');
                }
            } else {
                const buyerIsCorp = buyerSideIsCorporate(mostRecentRaw);
                const sellerIsCorp = sellerSideIsCorporate(mostRecentRaw);

                // ── Wholesale check ─────────────────────────────────────────
                if (buyerIsCorp && sellerIsCorp) {
                    const mostRecentRecDate = getDate(
                        mostRecentRaw,
                        'RECORDING_DATE',
                        'recording_date',
                    );
                    if (mostRecentRecDate) {
                        // Seller identity on the most recent tx (company id + borrower-1/2
                        // names), matched against each prior tx's buyer side.
                        const sellerTok = sellerTokens(mostRecentRaw);

                        // Find the previous Arms Length tx where the seller (on mostRecent)
                        // was the buyer — by company id OR normalized name (borrower-2 aware).
                        const sellerAcquisition = sorted.slice(1).find((tx) => {
                            const txRaw = tx as Record<string, unknown>;
                            const txRecDate = getDate(txRaw, 'RECORDING_DATE', 'recording_date');
                            if (!txRecDate) return false;
                            return intersects(sellerTok, buyerTokens(txRaw));
                        });

                        if (sellerAcquisition) {
                            const acquisitionDate = getDate(
                                sellerAcquisition as Record<string, unknown>,
                                'RECORDING_DATE',
                                'recording_date',
                            );
                            const daysHeld = daysBetweenUTC(mostRecentRecDate, acquisitionDate);
                            if (
                                daysHeld !== null &&
                                daysHeld >= 0 &&
                                daysHeld <= WHOLESALE_DAYS_THRESHOLD
                            ) {
                                statuses.push('wholesale');
                            }
                        }
                    }
                }

                // ── Sold check ───────────────────────────────────────────────
                if (sellerIsCorp && !buyerIsCorp) {
                    statuses.push('sold');
                }

                // ── In-renovation check ──────────────────────────────────────
                if (buyerIsCorp) {
                    statuses.push('in-renovation');
                }
            }
        }

        // Default: if no statuses resolved, log and skip (caller handles display fallback)
        if (statuses.length === 0) {
            console.log(
                `${label} No status resolved for property ${property.property_id ?? 'unknown'} — buyer/seller are both non-corporate`,
            );
        }

        // Write canonical buyer/seller from most recent tx back onto the property object
        if (mostRecentRaw) {
            property.buyer_id = mostRecentRaw.buyer_id ?? null;
            property.seller_id = mostRecentRaw.seller_id ?? null;
            const buyerName = getString(
                mostRecentRaw,
                'BUYER_BORROWER1_NAME',
                'buyer_borrower1_name',
            );
            const sellerName = getString(mostRecentRaw, 'SELLER1_NAME', 'seller1_name');
            const cs = (property.current_sale as Record<string, unknown>) ?? {};
            property.current_sale = { ...cs, buyer_1: buyerName, seller_1: sellerName };
        }

        // Set property.status to statuses[0] for backward compat with shared v1 helpers
        const primaryStatus: PropertyStatus = statuses[0] ?? 'in-renovation';
        property.status = primaryStatus;

        return {
            ...item,
            property: property as PropertyWithStatuses['property'],
            statuses,
        };
    });
}
