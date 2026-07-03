/**
 * Transaction ordering and spread calculation utilities.
 *
 * Orders ALL transaction types (Arms Length, Non-Arms Length, REFI, HELOC, etc.)
 * most-recent-first by RECONSTRUCTING the ownership chain rather than comparing
 * pairs. Within a recording-date group, "x is more recent than y" when an entity
 * that sells in x bought in y (x is the resale); a stable topological sort then
 * yields a valid order — a pairwise comparator cannot, because the chain relation
 * is non-transitive for 3+ linked transactions (it produces engine-dependent,
 * sometimes wrong, orderings).
 *
 * Spread calculation traces the ownership chain — including Non-Arms Length
 * transfers (e.g. individual → LLC) — to find the seller's true acquisition price.
 *
 * Accessors read BOTH naming conventions so the same code serves the ingest status
 * path (raw SFR rows: BUYER_BORROWER1_NAME, RECORDING_DATE, SALE_AMT, buyer_id …)
 * and the mapped/DB path (buyerName, recordingDate, salePrice, buyerId …). Entity
 * matching uses company id when present, otherwise a normalized name, and considers
 * borrower-2 / seller-2 when the row carries them (raw SFR only — the DB
 * property_transactions table stores borrower-1 / seller-1 only).
 */

/** Any transaction-like row. Recognized keys (either convention, all optional):
 *  recordingDate|RECORDING_DATE, saleDate|SALE_DATE, transactionType|TRANSACTION_TYPE,
 *  buyerName|BUYER_BORROWER1_NAME, buyerName2|BUYER_BORROWER2_NAME,
 *  sellerName|SELLER1_NAME, sellerName2|SELLER2_NAME, buyerId|buyer_id,
 *  sellerId|seller_id, salePrice|SALE_AMT, firstMtgLenderName|FIRST_MTG_LENDER_NAME. */
type TxRow = Record<string, unknown>;

// ── Field accessors (dual convention: mapped camelCase | raw SFR UPPERCASE) ──────

/** First non-empty trimmed string value across the given keys. */
function pickStr(tx: TxRow, ...keys: string[]): string {
    for (const k of keys) {
        const v = tx[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** Coerce a date-ish value (Date | string) to a comparable YYYY-MM-DD string ('' if none). */
function toDateStr(d: unknown): string {
    if (d == null) return '';
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    if (typeof d === 'string') return d.split('T')[0].trim();
    return '';
}

function pickDate(tx: TxRow, ...keys: string[]): string {
    for (const k of keys) {
        const s = toDateStr(tx[k]);
        if (s) return s;
    }
    return '';
}

function parsePrice(p: unknown): number | null {
    if (p == null) return null;
    const n = typeof p === 'number' ? p : parseFloat(String(p));
    return Number.isNaN(n) ? null : n;
}

/** First parseable numeric value across the given keys (null if none parse). */
function pickNum(tx: TxRow, ...keys: string[]): number | null {
    for (const k of keys) {
        const n = parsePrice(tx[k]);
        if (n !== null) return n;
    }
    return null;
}

const recordingOf = (tx: TxRow) =>
    pickDate(tx, 'recordingDate', 'RECORDING_DATE', 'recording_date');
const typeOf = (tx: TxRow) =>
    pickStr(tx, 'transactionType', 'TRANSACTION_TYPE', 'transaction_type');

/** Sale price across key variants (null if none parse) — the shared qualifying-price test. */
export function priceOf(tx: TxRow): number | null {
    return pickNum(tx, 'salePrice', 'SALE_AMT', 'sale_amt');
}
const buyerIdOf = (tx: TxRow) => pickStr(tx, 'buyerId', 'buyer_id');
const sellerIdOf = (tx: TxRow) => pickStr(tx, 'sellerId', 'seller_id');

const buyerNamesOf = (tx: TxRow) =>
    dedupe([
        nameKey(pickStr(tx, 'buyerName', 'BUYER_BORROWER1_NAME', 'buyer_borrower1_name')),
        nameKey(pickStr(tx, 'buyerName2', 'BUYER_BORROWER2_NAME', 'buyer_borrower2_name')),
    ]);

const sellerNamesOf = (tx: TxRow) =>
    dedupe([
        nameKey(pickStr(tx, 'sellerName', 'SELLER1_NAME', 'seller1_name')),
        nameKey(pickStr(tx, 'sellerName2', 'SELLER2_NAME', 'seller2_name')),
    ]);

// ── Normalization ────────────────────────────────────────────────────────────────

/**
 * Canonical key for entity-name comparison: lowercased, "&"→"and", punctuation and a
 * leading "the" removed, whitespace collapsed. Makes "THE ROBERT & SALLY AVILA FAMILY
 * TRUST" and "ROBERT AND SALLY AVILA FAMILY TRUST" compare equal. Deliberately does NOT
 * reorder tokens or fuzzy-match — that risks linking genuinely different parties.
 */
export function nameKey(name: string | null | undefined): string {
    if (!name) return '';
    let k = String(name).toLowerCase().trim();
    k = k.replace(/&/g, ' and ');
    k = k.replace(/['.,]/g, '');
    k = k.replace(/\s+/g, ' ').trim();
    k = k.replace(/^the\s+/, '');
    return k;
}

/** SFR truncates some name fields (notably SELLER1_NAME) at exactly this width. */
const SFR_NAME_TRUNCATION_WIDTH = 40;

/**
 * Repairs SFR's 40-char name truncation within one property's transactions so the
 * name-token matchers (traceAcquisition, computeSaleRatios) can link a truncated
 * seller to its full buyer record (e.g. seller "…DEVELOPMENT GR" ↔ buyer
 * "…DEVELOPMENT GROUP INC"). A name is expanded only when it is exactly the
 * truncation width, exactly one longer name in the history extends it (normalized),
 * and the extension continues MID-WORD — an extension that adds a whole new word
 * ("… II LLC" → "… II LLC SERIES B") is a related-but-distinct entity, not a
 * truncation artifact, and is left untouched, as are ambiguous prefixes.
 *
 * Reads/writes the mapped DB field names (buyerName/sellerName); callers on the raw
 * SFR shape must map first. Applied by the supplemental-tax trace and by
 * purchase-to-ARV ratio accumulation — other name-matching consumers (spread,
 * status/owner resolution) can adopt it the same way.
 */
export function expandTruncatedNames<
    T extends { buyerName: string | null; sellerName: string | null },
>(txs: T[]): T[] {
    const fullNames: string[] = [];
    for (const tx of txs) {
        for (const name of [tx.buyerName, tx.sellerName]) {
            if (name && name.length > SFR_NAME_TRUNCATION_WIDTH) fullNames.push(name);
        }
    }
    if (fullNames.length === 0) return txs;

    const fullEntries = fullNames.map((full) => ({ full, key: nameKey(full) }));

    const expand = (name: string | null): string | null => {
        if (!name || name.length !== SFR_NAME_TRUNCATION_WIDTH) return name;
        const prefix = nameKey(name);
        // Mid-word continuation only: a space at the cut point means the shorter name
        // is complete and the longer one merely adds a word — a different entity.
        const matches = fullEntries.filter(
            (e) =>
                e.key.length > prefix.length &&
                e.key.startsWith(prefix) &&
                e.key[prefix.length] !== ' ',
        );
        const distinct = new Set(matches.map((e) => e.key));
        return distinct.size === 1 ? matches[0].full : name;
    };

    return txs.map((tx) => ({
        ...tx,
        buyerName: expand(tx.buyerName),
        sellerName: expand(tx.sellerName),
    }));
}

/** Normalize a transaction type for tolerant matching ("Arm's Length", "Arms-Length"). */
function normalizeType(type: string): string {
    return type.toLowerCase().replace(/'/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Arms Length (tolerant of apostrophes, hyphens, casing). */
export function isArmsLength(tx: TxRow): boolean {
    return normalizeType(typeOf(tx)) === 'arms length';
}

/** Non-Arms Length transfer (individual→LLC, family transfer, trust re-titling). */
function isNonArmsLength(tx: TxRow): boolean {
    return normalizeType(typeOf(tx)) === 'non arms length';
}

// ── Identity matching (company id OR normalized name, borrower-2 aware) ───────────

function dedupe(arr: string[]): string[] {
    const out: string[] = [];
    for (const x of arr) if (x && out.indexOf(x) === -1) out.push(x);
    return out;
}

/** True if the two token lists share at least one element. */
export function intersects(a: string[], b: string[]): boolean {
    return a.some((x) => b.indexOf(x) !== -1);
}

/** Identity tokens for the buyer side: id token (if resolved) + each normalized name. */
export function buyerTokens(tx: TxRow): string[] {
    const tokens: string[] = [];
    const id = buyerIdOf(tx);
    if (id) tokens.push('id:' + id.toLowerCase());
    for (const n of buyerNamesOf(tx)) tokens.push('name:' + n);
    return dedupe(tokens);
}

/** Identity tokens for the seller side. */
export function sellerTokens(tx: TxRow): string[] {
    const tokens: string[] = [];
    const id = sellerIdOf(tx);
    if (id) tokens.push('id:' + id.toLowerCase());
    for (const n of sellerNamesOf(tx)) tokens.push('name:' + n);
    return dedupe(tokens);
}

// ── Chain reconstruction ─────────────────────────────────────────────────────────

interface IndexedTx<T> {
    tx: T;
    i: number;
}

/**
 * Orders one set of SAME-recording-date transactions most-recent-first by
 * reconstructing the ownership chain. Edge "x more recent than y" exists when an
 * entity that SELLS in x BOUGHT in y (x is the resale, y the acquisition), so x
 * must precede y. A stable topological sort (Kahn's) produces a valid linear order.
 * Transactions with no chain relationship fall back to Arms-Length-first, then the
 * original input order. Cycles (degenerate data) are broken by the same tie-break so
 * the routine always terminates.
 */
function orderSameDateGroupDesc<T extends TxRow>(group: IndexedTx<T>[]): T[] {
    const n = group.length;
    if (n === 1) return [group[0].tx];

    const buyersOf = group.map((g) => buyerTokens(g.tx));
    const sellersOf = group.map((g) => sellerTokens(g.tx));

    // successors[x] = indices y that x precedes (x is more recent than y)
    const successors: number[][] = group.map(() => []);
    const indegree = new Array<number>(n).fill(0);

    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            if (x === y) continue;
            if (intersects(sellersOf[x], buyersOf[y])) {
                successors[x].push(y);
                indegree[y] += 1;
            }
        }
    }

    const moreRecentFirst = (a: number, b: number): number => {
        const alA = isArmsLength(group[a].tx);
        const alB = isArmsLength(group[b].tx);
        if (alA !== alB) return alA ? -1 : 1; // Arms Length first
        return group[a].i - group[b].i; // stable: original input order
    };

    const remaining = group.map((_, idx) => idx);
    const out: T[] = [];

    while (remaining.length > 0) {
        // Sources = nothing remaining is "more recent than" them (indegree 0).
        let pool = remaining.filter((idx) => indegree[idx] === 0);
        if (pool.length === 0) pool = remaining.slice(); // cycle fallback
        pool.sort(moreRecentFirst);
        const pick = pool[0];

        out.push(group[pick].tx);
        remaining.splice(remaining.indexOf(pick), 1);
        for (const y of successors[pick]) indegree[y] -= 1;
    }

    return out;
}

/**
 * Sorts transactions most-recent-first using:
 *   1. recording_date DESC (reliable across different dates; missing dates sort last)
 *   2. within a same-recording-date group: ownership-chain reconstruction (see above)
 *
 * Chain links are resolved only WITHIN a recording-date group — across different
 * recording dates the recording_date is trusted (an entity cannot sell before it
 * buys, so a same-day buy+sell is the only genuinely ambiguous case).
 *
 * Returns the same row objects, reordered. Works on ALL transaction types.
 */
export function sortTransactionsDesc<T extends TxRow>(txs: T[]): T[] {
    if (txs.length <= 1) return [...txs];

    const indexed: IndexedTx<T>[] = txs.map((tx, i) => ({ tx, i }));

    const groups = new Map<string, IndexedTx<T>[]>();
    for (const item of indexed) {
        const key = recordingOf(item.tx);
        const bucket = groups.get(key);
        if (bucket) bucket.push(item);
        else groups.set(key, [item]);
    }

    // recording_date DESC; missing date ('') always last.
    const dateKeys = Array.from(groups.keys()).sort((a, b) => {
        if (a === b) return 0;
        if (a === '') return 1;
        if (b === '') return -1;
        return a > b ? -1 : 1;
    });

    const result: T[] = [];
    for (const key of dateKeys) {
        const ordered = orderSameDateGroupDesc(groups.get(key)!);
        for (const tx of ordered) result.push(tx);
    }
    return result;
}

// ── Spread / acquisition trace ───────────────────────────────────────────────────

/**
 * Traces back through (most-recent-first) transactions to find when the entity
 * identified by `targetTokens` acquired the property, following Non-Arms Length
 * transfers (individual → LLC, family re-titling). Id- and borrower-2-aware.
 */
function traceAcquisition<T extends TxRow>(
    txs: T[],
    targetTokens: string[],
    visited: Set<string>,
): { price: number; date: string } | null {
    if (targetTokens.length === 0 || targetTokens.some((t) => visited.has(t))) return null;
    for (const t of targetTokens) visited.add(t);

    for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!intersects(buyerTokens(tx), targetTokens)) continue;

        const price = priceOf(tx);
        const date = recordingOf(tx);

        // Arms Length with a real price → this is the acquisition
        if (isArmsLength(tx) && price !== null && price > 0) {
            return { price, date };
        }

        // Non-Arms Length transfer → trace whoever transferred it to this entity
        if (isNonArmsLength(tx)) {
            const result = traceAcquisition(txs.slice(i + 1), sellerTokens(tx), visited);
            if (result) return result;
        }
        // REFI / HELOC / Arms Length $0 / other → skip, keep searching
    }
    return null;
}

/**
 * The seller's own acquisition (price + date) for the Arms Length sale at `index` in a
 * most-recent-first transaction list — traced through Non-Arms Length transfers to the
 * seller's arm's-length purchase. The single qualification/trace step shared by
 * computeSaleRatios and the supplemental-tax prior value (the seller's traced
 * acquisition price is the property's current Prop-13 base value).
 */
export function traceSellerAcquisition<T extends TxRow>(
    sorted: T[],
    index: number,
): { price: number; date: string } | null {
    return traceAcquisition(sorted.slice(index + 1), sellerTokens(sorted[index]), new Set());
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
 * Calculates buyer purchase price, seller purchase price, and spread from a list of
 * ALL property transactions (re-sorted internally, so input order is not trusted).
 *
 * Buyer purchase price  = most recent Arms Length sale price > 0.
 * Seller purchase price = traced back through Non-Arms Length transfers until an
 *   Arms Length purchase price > 0 is found.
 * Spread = buyer purchase price − seller purchase price.
 */
export function calculateSpread<T extends TxRow>(txs: T[]): SpreadResult<T> {
    const empty: SpreadResult<T> = {
        buyerPurchasePrice: null,
        buyerPurchaseDate: null,
        sellerPurchasePrice: null,
        sellerPurchaseDate: null,
        spread: null,
        latestArmsLengthTx: null,
    };
    if (txs.length === 0) return empty;

    const sorted = sortTransactionsDesc(txs);
    const armsLength = sorted.filter(isArmsLength);
    const latestArmsLengthTx = armsLength[0] ?? null;

    const buyerTxIdx = armsLength.findIndex((tx) => (priceOf(tx) ?? 0) > 0);
    if (buyerTxIdx === -1) return { ...empty, latestArmsLengthTx };

    const buyerTx = armsLength[buyerTxIdx];
    const buyerPurchasePrice = priceOf(buyerTx)!;
    const buyerPurchaseDate = recordingOf(buyerTx) || null;

    // Trace seller's acquisition through txs at/older than the buyer tx (exclude itself).
    const buyerRec = recordingOf(buyerTx);
    const olderTxs = sorted.filter((tx) => {
        if (tx === buyerTx) return false;
        const d = recordingOf(tx);
        return !d || !buyerRec || d <= buyerRec;
    });

    const sellerData = traceAcquisition(olderTxs, sellerTokens(buyerTx), new Set());
    const sellerPurchasePrice = sellerData?.price ?? null;
    const sellerPurchaseDate = sellerData?.date || null;
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

// ── Assignor ───────────────────────────────────────────────────────────────────────

/** The assignment metadata carried on a flagged sale row. */
export interface AssignorInfo {
    assignorId: string | null;
    assignorName: string | null;
}

/**
 * Reads the assignor off the most-recent flagged sale row. An assignment lives on the
 * arms-length sale transaction (is_assignment = true); the row with the lowest sortOrder
 * (1 = most recent per pipeline convention) is the property's current assignment. Input
 * may be in any order — recency is resolved by sortOrder here, not by caller ordering.
 *
 * @param txs a property's transaction rows (needs isAssignment, sortOrder, assignor*)
 * @returns the assignor id/name, or nulls when the property has no assignment
 */
export function getAssignorFromTxs(
    txs: Array<{
        isAssignment: boolean;
        sortOrder: number | null;
        assignorId: string | null;
        assignorName: string | null;
    }>,
): AssignorInfo {
    const assignmentTx = txs
        .filter((tx) => tx.isAssignment)
        .sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))[0];
    return {
        assignorId: assignmentTx?.assignorId ?? null,
        assignorName: assignmentTx?.assignorName ?? null,
    };
}

// ── Purchase-to-ARV ratio ──────────────────────────────────────────────────────────

/** One Arms Length sale's purchase-to-ARV ratio for a single property. */
export interface SaleRatio {
    /** Resolved company id of the seller, or null when the seller wasn't matched to a company. */
    sellerId: string | null;
    /** Price the seller originally paid (traced through Non-Arms Length transfers). */
    purchasePrice: number;
    /** Price the property sold for in this transaction — the ARV realized at sale. */
    soldPrice: number;
    /** purchasePrice / soldPrice. */
    ratio: number;
}

/**
 * Computes a purchase-to-ARV ratio for EVERY Arms Length sale (price > 0) in one
 * property's transaction list. For each such sale it traces the seller's own
 * acquisition price among older transactions — following Non-Arms Length transfers,
 * exactly like calculateSpread — and emits { sellerId, purchasePrice, soldPrice, ratio }.
 *
 * Unlike calculateSpread (which only inspects the single most-recent flip), this returns
 * one entry per sale, so a property flipped by several companies over time yields an
 * independent ratio for each seller — none is lost to a later re-flip. A sale is omitted
 * (never counted as zero) when the seller's acquisition price can't be found or isn't > 0.
 *
 * Input order is not trusted; transactions are re-sorted most-recent-first internally.
 *
 * @param txs all transactions for a single property (any types, any order)
 * @returns one SaleRatio per qualifying Arms Length sale
 */
export function computeSaleRatios<T extends TxRow>(txs: T[]): SaleRatio[] {
    if (txs.length === 0) return [];
    const sorted = sortTransactionsDesc(txs);
    const ratios: SaleRatio[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const saleTx = sorted[i];
        if (!isArmsLength(saleTx)) continue;
        const soldPrice = priceOf(saleTx);
        if (soldPrice === null || soldPrice <= 0) continue;

        // Trace the seller's acquisition among strictly-older transactions — everything
        // after this sale in most-recent-first order is older (or a same-day chain link).
        const acquisition = traceSellerAcquisition(sorted, i);
        if (!acquisition || acquisition.price <= 0) continue;

        ratios.push({
            sellerId: sellerIdOf(saleTx) || null,
            purchasePrice: acquisition.price,
            soldPrice,
            ratio: acquisition.price / soldPrice,
        });
    }

    return ratios;
}
