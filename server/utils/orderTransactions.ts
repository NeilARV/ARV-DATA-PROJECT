/**
 * Transaction ordering and spread calculation utilities.
 *
 * Sorts ALL transaction types (Arms Length, Non-Arms Length, REFI, HELOC, etc.)
 * using: recording_date DESC → chain detection → sale_date DESC → original order.
 *
 * Spread calculation traces the ownership chain — including Non-Arms Length
 * transfers (e.g. individual → LLC) — to find the seller's true acquisition price.
 */

type TxRow = {
    recordingDate: Date | string | null;
    saleDate?: Date | string | null;
    buyerId?: string | null;
    buyerName?: string | null;
    sellerId?: string | null;
    sellerName?: string | null;
    salePrice?: string | number | null;
    transactionType?: string | null;
    firstMtgLenderName?: string | null;
    [k: string]: unknown;
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === 'string') return d.split('T')[0] ?? null;
    return (d as Date).toISOString().split('T')[0] ?? null;
}

function nameKey(s: string | null | undefined): string {
    return s != null ? String(s).trim().toLowerCase() : '';
}

function parsePrice(p: string | number | null | undefined): number | null {
    if (p == null) return null;
    const n = typeof p === 'number' ? p : parseFloat(String(p));
    return isNaN(n) ? null : n;
}

function isArmsLength(tx: TxRow): boolean {
    return (tx.transactionType ?? '').trim().toLowerCase() === 'arms length';
}

function isNonArmsLength(tx: TxRow): boolean {
    return (tx.transactionType ?? '').trim().toLowerCase() === 'non-arms length';
}

function matchesBuyer(tx: TxRow, targetName: string, targetId: string | null): boolean {
    if (targetId) {
        const bid = tx.buyerId != null ? String(tx.buyerId).trim().toLowerCase() : '';
        if (bid && String(targetId).trim().toLowerCase() === bid) return true;
    }
    if (targetName) {
        const bname = nameKey(tx.buyerName);
        if (bname && bname === targetName) return true;
    }
    return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sorts transactions most-recent-first using:
 *  1. recording_date DESC
 *  2. Chain detection (same recording_date): a seller for an Arms Length tx must
 *     have been the buyer first — traces buyer/seller name links to order the chain
 *  3. Transaction type priority (same recording_date): Arms Length before all others
 *  4. Original array order (stable fallback)
 *
 * Works on ALL transaction types (not just Arms Length).
 */
export function sortTransactionsDesc<T extends TxRow>(txs: T[]): T[] {
    if (txs.length <= 1) return [...txs];

    return [...txs].sort((a, b) => {
        // 1. recording_date DESC
        const recA = toDateStr(a.recordingDate);
        const recB = toDateStr(b.recordingDate);
        if (recA && recB) {
            if (recA > recB) return -1;
            if (recA < recB) return 1;
        } else if (recA) return -1;
        else if (recB) return 1;

        // 2. Chain detection (same recording_date)
        // The same entity that bought in tx_b later sold in tx_a → tx_a is more recent
        const buyerA = nameKey(a.buyerName);
        const sellerA = nameKey(a.sellerName);
        const buyerB = nameKey(b.buyerName);
        const sellerB = nameKey(b.sellerName);
        if (buyerB && sellerA && buyerB === sellerA) return -1;
        if (buyerA && sellerB && buyerA === sellerB) return 1;

        // 3. Arms Length before all other transaction types
        const aIsAL = isArmsLength(a);
        const bIsAL = isArmsLength(b);
        if (aIsAL && !bIsAL) return -1;
        if (!aIsAL && bIsAL) return 1;

        return 0; // preserve original order
    });
}

/**
 * Traces back through sorted transactions to find when `targetName`/`targetId`
 * acquired the property, following Non-Arms Length transfers (e.g. individual → LLC).
 *
 * - Arms Length with price > 0 → return that price
 * - Non-Arms Length (price = 0) → follow the seller of that tx (e.g. "YOCUM RICHARD"
 *   transferred to "YOCUM RICHARD C" then to "SUMMIT VISTA PROPERTIES LLC")
 * - REFI / HELOC / other → skip and continue searching
 */
function traceAcquisition<T extends TxRow>(
    txs: T[],
    targetName: string,
    targetId: string | null,
    visited: Set<string>,
): { price: number; date: string } | null {
    if (!targetName && !targetId) return null;
    const visitKey = targetId ? String(targetId).toLowerCase() : targetName;
    if (visited.has(visitKey)) return null;
    visited.add(visitKey);

    for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!matchesBuyer(tx, targetName, targetId)) continue;

        const price = parsePrice(tx.salePrice);
        const date = toDateStr(tx.recordingDate) ?? '';

        // Arms Length with a real price → this is the acquisition
        if (isArmsLength(tx) && price !== null && price > 0) {
            return { price, date };
        }

        // Non-Arms Length → transfer (individual → LLC, family transfer, etc.)
        // Trace back to whoever transferred the property to this entity
        if (isNonArmsLength(tx)) {
            const prevName = nameKey(tx.sellerName);
            const prevId = (tx.sellerId as string | null) ?? null;
            const result = traceAcquisition(txs.slice(i + 1), prevName, prevId, visited);
            if (result) return result;
            // If trace failed, continue searching for another buyer match
        }

        // REFI / HELOC / Arms Length $0 / other → skip, keep searching
    }

    return null;
}

type SpreadResult<T extends TxRow> = {
    buyerPurchasePrice: number | null;
    buyerPurchaseDate: string | null;
    sellerPurchasePrice: number | null;
    sellerPurchaseDate: string | null;
    spread: number | null;
    /** The most recent Arms Length tx — used for display names and ARV Finance check. */
    latestArmsLengthTx: T | null;
};

/**
 * Calculates buyer purchase price, seller purchase price, and spread from
 * a sorted (most-recent-first) list of ALL property transactions.
 *
 * Buyer purchase price  = most recent Arms Length sale price > 0.
 * Seller purchase price = traced back through Non-Arms Length transfers until
 *   an Arms Length purchase price > 0 is found.
 * Spread = buyer purchase price − seller purchase price.
 */
export function calculateSpread<T extends TxRow>(sortedTxs: T[]): SpreadResult<T> {
    const empty: SpreadResult<T> = {
        buyerPurchasePrice: null,
        buyerPurchaseDate: null,
        sellerPurchasePrice: null,
        sellerPurchaseDate: null,
        spread: null,
        latestArmsLengthTx: null,
    };

    if (sortedTxs.length === 0) return empty;

    // Sort Arms Length transactions separately to find buyerTx reliably.
    // Mixing Non-Arms Length txs into a single sort creates non-transitive comparisons
    // when same-recording-date Arms Length and Non-Arms Length transactions are present
    // (e.g. simultaneous-close wholesale + LLC transfer all on the same date).
    // The pipeline's sortArmsLengthDesc uses the same filter-first approach.
    const sortedAL = sortTransactionsDesc(sortedTxs.filter(isArmsLength));
    const latestArmsLengthTx = sortedAL[0] ?? null;

    // Find most recent Arms Length tx with a real price (> 0)
    const buyerTxIdx = sortedAL.findIndex((tx) => (parsePrice(tx.salePrice) ?? 0) > 0);

    // No priced Arms Length tx — still expose latestArmsLengthTx for name/ARV check
    if (buyerTxIdx === -1) {
        return { ...empty, latestArmsLengthTx };
    }

    const buyerTx = sortedAL[buyerTxIdx];
    const buyerPurchasePrice = parsePrice(buyerTx.salePrice)!;
    const buyerPurchaseDate = toDateStr(buyerTx.recordingDate);

    // For traceAcquisition use ALL transaction types (including Non-Arms Length) so
    // individual → LLC transfers can be followed to find the true acquisition price.
    // Restrict to txs at or before buyerTx's recording date to avoid looking forward
    // in time, and exclude buyerTx itself.
    const buyerRecDate = toDateStr(buyerTx.recordingDate);
    const olderTxs = sortedTxs.filter((tx) => {
        if (tx === buyerTx) return false;
        const d = toDateStr(tx.recordingDate);
        return !d || !buyerRecDate || d <= buyerRecDate;
    });

    // Trace seller's acquisition price through the history
    const sellerName = nameKey(buyerTx.sellerName);
    const sellerId = (buyerTx.sellerId as string | null) ?? null;
    const sellerData = traceAcquisition(olderTxs, sellerName, sellerId, new Set());

    const sellerPurchasePrice = sellerData?.price ?? null;
    const sellerPurchaseDate = sellerData?.date ?? null;
    const spread = sellerPurchasePrice !== null ? buyerPurchasePrice - sellerPurchasePrice : null;

    return {
        buyerPurchasePrice,
        buyerPurchaseDate,
        sellerPurchasePrice,
        sellerPurchaseDate,
        spread,
        latestArmsLengthTx,
    };
}
