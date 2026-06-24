/**
 * Transaction-sort sandbox — UPGRADED algorithm (proposed pipeline replacement).
 *
 * Reads a raw SFR `/properties/transactions` response from scripts/test.json,
 * runs the ordering + status + spread logic in isolation, and writes the result
 * to scripts/output.json. No imports from server/ — edit and validate freely here
 * before any of this is ported into the real pipeline.
 *
 * What changed vs. the old pipeline logic (the bugs this fixes):
 *   1. Chain reconstruction instead of a pairwise comparator. The old sort encoded
 *      "who sold to whom" as an Array.sort comparator, which is non-transitive for
 *      3+ same-recording-date transactions and produced engine-dependent (wrong)
 *      orderings. We now group by recording_date and topologically order each group
 *      from the buyer→seller ownership links. One sort drives BOTH display + status.
 *   2. Case-insensitive, punctuation-tolerant name matching ("THE ROBERT & SALLY…"
 *      now matches "ROBERT AND SALLY…").
 *   3. BUYER_BORROWER2 / SELLER2 now participate in chain + acquisition matching.
 *   4. Arms-length detection tolerates punctuation/spacing variants ("Arm's Length",
 *      "Arms-Length", "ARMS LENGTH").
 *   5. calculateSpread + traceAcquisition ported in, so buyer/seller purchase price
 *      and spread are computed (the "what did they originally pay" piece).
 *   6. DST-safe day math (UTC) + a held>=0 guard on the wholesale window.
 *
 * Usage:
 *   npx tsx scripts/transaction-sort.ts
 */

import { readFileSync, writeFileSync } from 'fs';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** One raw transaction as SFR returns it (UPPERCASE keys). Extra keys allowed. */
type RawTransaction = Record<string, unknown>;

interface TransactionsFile {
    property_id?: number | string;
    address?: string;
    /** Optional — not part of the transactions response; add it to test on-market. */
    listing_status?: string;
    transactions: RawTransaction[];
}

type PropertyStatus = 'on-market' | 'in-renovation' | 'sold' | 'wholesale';

const WHOLESALE_DAYS_THRESHOLD = 30;

// ─── Field readers ───────────────────────────────────────────────────────────────

/** First non-empty trimmed string value across the given keys. */
function getString(tx: RawTransaction, ...keys: string[]): string {
    for (const k of keys) {
        const v = tx[k];
        if (v != null && typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

/** Normalize a date to YYYY-MM-DD (string-comparable). Returns '' if absent/unparseable. */
function getDate(tx: RawTransaction, ...keys: string[]): string {
    for (const k of keys) {
        const raw = getString(tx, k);
        if (raw) {
            const ymd = raw.split('T')[0].trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
        }
    }
    return '';
}

const buyer1 = (tx: RawTransaction) => getString(tx, 'BUYER_BORROWER1_NAME', 'buyer_borrower1_name');
const buyer2 = (tx: RawTransaction) => getString(tx, 'BUYER_BORROWER2_NAME', 'buyer_borrower2_name');
const seller1 = (tx: RawTransaction) => getString(tx, 'SELLER1_NAME', 'seller1_name');
const seller2 = (tx: RawTransaction) => getString(tx, 'SELLER2_NAME', 'seller2_name');
const recDate = (tx: RawTransaction) => getDate(tx, 'RECORDING_DATE', 'recording_date');
const saleDate = (tx: RawTransaction) => getDate(tx, 'SALE_DATE', 'sale_date');
const txType = (tx: RawTransaction) => getString(tx, 'TRANSACTION_TYPE', 'transaction_type');

function parsePrice(p: unknown): number | null {
    if (p == null) return null;
    const n = typeof p === 'number' ? p : parseFloat(String(p));
    return Number.isNaN(n) ? null : n;
}

function salePriceOf(tx: RawTransaction): number | null {
    return parsePrice(tx.SALE_AMT ?? tx.sale_amt);
}

// ─── Name + type normalization (fix #2, #4) ──────────────────────────────────────

/**
 * Canonical key for entity-name comparison: lowercased, "&"→"and", punctuation and a
 * leading "the" removed, whitespace collapsed. Makes "THE ROBERT & SALLY AVILA FAMILY
 * TRUST" and "ROBERT AND SALLY AVILA FAMILY TRUST" compare equal. Deliberately does NOT
 * do token reordering or fuzzy matching — that risks linking genuinely different parties.
 */
function nameKey(name: string): string {
    if (!name) return '';
    let k = name.toLowerCase().trim();
    k = k.replace(/&/g, ' and ');
    k = k.replace(/['.,]/g, '');
    k = k.replace(/\s+/g, ' ').trim();
    k = k.replace(/^the\s+/, '');
    return k;
}

/** Normalize a transaction type for tolerant matching: drop apostrophes, hyphens→space. */
function normalizeType(type: string): string {
    return type
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Arms Length (tolerant of "Arm's Length", "Arms-Length", casing). */
function isArmsLength(tx: RawTransaction): boolean {
    return normalizeType(txType(tx)) === 'arms length';
}

/** Non-Arms Length transfer (individual→LLC, family transfer, trust re-titling). */
function isNonArmsLength(tx: RawTransaction): boolean {
    return normalizeType(txType(tx)) === 'non arms length';
}

/** All buyer-side names on a tx (borrower 1 + 2), normalized + deduped. */
function entityBuyers(tx: RawTransaction): string[] {
    return dedupe([nameKey(buyer1(tx)), nameKey(buyer2(tx))]);
}

/** All seller-side names on a tx (seller 1 + 2), normalized + deduped. */
function entitySellers(tx: RawTransaction): string[] {
    return dedupe([nameKey(seller1(tx)), nameKey(seller2(tx))]);
}

function dedupe(arr: string[]): string[] {
    const out: string[] = [];
    for (const x of arr) if (x && !out.includes(x)) out.push(x);
    return out;
}

function intersects(a: string[], b: string[]): boolean {
    return a.some((x) => b.includes(x));
}

// ─── Entity classification (copied from server/utils/dataSyncHelpers.ts) ──────────

function isTrust(name: string): boolean {
    if (!name) return false;
    const trustPatterns = [
        /\bTRUST\b/i,
        /\bLIVING TRUST\b/i,
        /\bFAMILY TRUST\b/i,
        /\bREVOCABLE TRUST\b/i,
        /\bIRREVOCABLE TRUST\b/i,
        /\bSPOUSAL TRUST\b/i,
    ];
    return trustPatterns.some((p) => p.test(name));
}

const KNOWN_CORPORATE_NAMES: ReadonlySet<string> = new Set([
    'opendoor',
    'starwood',
    'first key homes',
    'firstkey homes',
    'conrex',
    'progress residential',
    'invitation homes',
    'main street renewal',
    'divvy homes',
    'tricon residential',
    'american homes 4 rent',
    'amh',
    'mynd',
    'roofstock',
    'waypoint homes',
]);

/** Corporate, non-trust entity ("flipping company"). */
function isFlippingCompany(name: string): boolean {
    if (!name) return false;
    if (isTrust(name)) return false;
    if (KNOWN_CORPORATE_NAMES.has(name.trim().toLowerCase())) return true;
    const corporatePatterns = [
        /\bLLC\b/i,
        /\bINC\b/i,
        /\bCORPS?\b/i,
        /\bCORPORATION\b/i,
        /\bLTD\b/i,
        /\bLP\b/i,
        /\bPROPERTIES\b/i,
        /\bINVESTMENTS?\b/i,
        /\bCAPITAL\b/i,
        /\bVENTURES?\b/i,
        /\bHOLDINGS?\b/i,
        /\bREALTY\b/i,
        /\bENTERPRISES?\b/i,
    ];
    return corporatePatterns.some((p) => p.test(name));
}

/** True if EITHER borrower on the tx is a flipping company. */
function buyerSideIsCorporate(tx: RawTransaction): boolean {
    return isFlippingCompany(buyer1(tx)) || isFlippingCompany(buyer2(tx));
}

/** True if EITHER seller on the tx is a flipping company. */
function sellerSideIsCorporate(tx: RawTransaction): boolean {
    return isFlippingCompany(seller1(tx)) || isFlippingCompany(seller2(tx));
}

// ─── Sort: chain reconstruction (fix #1) ──────────────────────────────────────────

interface IndexedTx {
    tx: RawTransaction;
    i: number;
}

/**
 * Orders one set of SAME-recording-date transactions most-recent-first by
 * reconstructing the ownership chain — NOT by a pairwise comparator (which is
 * non-transitive for 3+ linked transactions and yields engine-dependent results).
 *
 * Edge "x is more recent than y" exists when an entity that SELLS in x BOUGHT in y
 * (x is the resale, y the acquisition, so x must precede y). A stable topological
 * sort (Kahn's) then produces a valid linear order. Transactions with no chain
 * relationship fall back to: Arms Length first, then original SFR order. Cycles
 * (degenerate/contradictory data) are broken by the same tie-break so it always
 * terminates.
 */
function orderSameDateGroupDesc(group: IndexedTx[]): RawTransaction[] {
    const n = group.length;
    if (n === 1) return [group[0].tx];

    const buyersOf = group.map((g) => entityBuyers(g.tx));
    const sellersOf = group.map((g) => entitySellers(g.tx));

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
        if (alA !== alB) return alA ? -1 : 1; // arms length first
        return group[a].i - group[b].i; // stable: original SFR order
    };

    const remaining = group.map((_, idx) => idx);
    const out: RawTransaction[] = [];

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
 * Sorts ALL transaction types most-recent-first.
 *   1. recording_date DESC (reliable across different dates)
 *   2. within a same-recording-date group: chain reconstruction (see above)
 *
 * Chain links are only resolved WITHIN a recording-date group — across different
 * recording dates the recording_date is trusted (an entity cannot sell before it
 * buys, so a same-day buy+sell is the only genuinely ambiguous case).
 */
function sortTransactionsDesc(txs: RawTransaction[]): RawTransaction[] {
    if (txs.length <= 1) return [...txs];

    const indexed: IndexedTx[] = txs.map((tx, i) => ({ tx, i }));

    const groups = new Map<string, IndexedTx[]>();
    for (const item of indexed) {
        const key = recDate(item.tx);
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

    const result: RawTransaction[] = [];
    for (const key of dateKeys) {
        const ordered = orderSameDateGroupDesc(groups.get(key)!);
        for (const tx of ordered) result.push(tx);
    }
    return result;
}

// ─── Spread + acquisition trace (fix #5, ported from orderTransactions.ts) ─────────

interface SpreadResult {
    buyerPurchasePrice: number | null;
    buyerPurchaseDate: string | null;
    sellerPurchasePrice: number | null;
    sellerPurchaseDate: string | null;
    spread: number | null;
    latestArmsLengthTx: RawTransaction | null;
}

/**
 * Traces back through (already most-recent-first) transactions to find when
 * `targetName` acquired the property, following Non-Arms Length transfers
 * (individual → LLC, family re-titling). Borrower-2 aware on both sides.
 */
function traceAcquisition(
    txs: RawTransaction[],
    targetName: string,
    visited: Set<string>,
): { price: number; date: string } | null {
    if (!targetName || visited.has(targetName)) return null;
    visited.add(targetName);

    for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        if (!entityBuyers(tx).includes(targetName)) continue;

        const price = salePriceOf(tx);
        const date = recDate(tx);

        // Arms Length with a real price → this is the acquisition
        if (isArmsLength(tx) && price !== null && price > 0) {
            return { price, date };
        }

        // Non-Arms Length transfer → trace whoever transferred it to this entity
        if (isNonArmsLength(tx)) {
            for (const prev of entitySellers(tx)) {
                const result = traceAcquisition(txs.slice(i + 1), prev, visited);
                if (result) return result;
            }
        }
        // REFI / HELOC / Arms Length $0 / other → skip, keep searching
    }
    return null;
}

/**
 * Buyer purchase price  = most-recent Arms Length sale price > 0.
 * Seller purchase price = traced back through Non-Arms Length transfers to the
 *   seller's own Arms Length acquisition price.
 * Spread = buyer purchase price − seller purchase price.
 */
function calculateSpread(sortedTxs: RawTransaction[]): SpreadResult {
    const empty: SpreadResult = {
        buyerPurchasePrice: null,
        buyerPurchaseDate: null,
        sellerPurchasePrice: null,
        sellerPurchaseDate: null,
        spread: null,
        latestArmsLengthTx: null,
    };
    if (sortedTxs.length === 0) return empty;

    // Input is already correctly ordered, so the Arms Length subsequence is correct too.
    const armsLength = sortedTxs.filter(isArmsLength);
    const latestArmsLengthTx = armsLength[0] ?? null;

    const buyerTxIdx = armsLength.findIndex((tx) => (salePriceOf(tx) ?? 0) > 0);
    if (buyerTxIdx === -1) return { ...empty, latestArmsLengthTx };

    const buyerTx = armsLength[buyerTxIdx];
    const buyerPurchasePrice = salePriceOf(buyerTx)!;
    const buyerPurchaseDate = recDate(buyerTx);

    // Trace seller's acquisition through txs at/older than the buyer tx (exclude itself).
    const buyerRec = recDate(buyerTx);
    const olderTxs = sortedTxs.filter((tx) => {
        if (tx === buyerTx) return false;
        const d = recDate(tx);
        return !d || !buyerRec || d <= buyerRec;
    });

    let sellerData: { price: number; date: string } | null = null;
    for (const sellerName of entitySellers(buyerTx)) {
        sellerData = traceAcquisition(olderTxs, sellerName, new Set());
        if (sellerData) break;
    }

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

// ─── Status resolution ────────────────────────────────────────────────────────────

interface StatusResult {
    statuses: PropertyStatus[];
    mostRecentArmsLength: string | null;
    explanation: string[];
}

/** DST-safe whole-day difference between two YYYY-MM-DD strings (fix #6). */
function daysBetween(laterYmd: string, earlierYmd: string): number | null {
    const a = ymdToUTC(laterYmd);
    const b = ymdToUTC(earlierYmd);
    if (a == null || b == null) return null;
    return Math.round((a - b) / 86_400_000);
}

function ymdToUTC(ymd: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function resolveStatus(txs: RawTransaction[], listingStatus: string): StatusResult {
    const explanation: string[] = [];

    if (listingStatus === 'On Market') {
        explanation.push('listing_status = "On Market" → forced to in-renovation (on-market disabled).');
        return { statuses: ['in-renovation'], mostRecentArmsLength: null, explanation };
    }

    const sortedAll = sortTransactionsDesc(txs);
    const armsLength = sortedAll.filter(isArmsLength);
    const mostRecent = armsLength[0] ?? null;
    if (!mostRecent) {
        explanation.push('No Arms Length transactions → status cannot be resolved from tx history.');
        return { statuses: [], mostRecentArmsLength: null, explanation };
    }

    const buyerIsCorp = buyerSideIsCorporate(mostRecent);
    const sellerIsCorp = sellerSideIsCorporate(mostRecent);
    const mostRecentLabel = `${recDate(mostRecent)} | ${buyer1(mostRecent) || '—'} ⇐ ${seller1(mostRecent) || '—'}`;
    explanation.push(
        `Most-recent Arms Length: ${mostRecentLabel}. ` +
            `buyer corporate=${buyerIsCorp}, seller corporate=${sellerIsCorp}.`,
    );

    const statuses: PropertyStatus[] = [];

    // Wholesale: corporate→corporate, and the seller acquired it ≤30 days earlier.
    if (buyerIsCorp && sellerIsCorp) {
        const sellerKeys = entitySellers(mostRecent);
        const acquisition = armsLength
            .slice(1)
            .find((tx) => recDate(tx) !== '' && intersects(entityBuyers(tx), sellerKeys));
        if (acquisition) {
            const held = daysBetween(recDate(mostRecent), recDate(acquisition));
            if (held !== null && held >= 0 && held <= WHOLESALE_DAYS_THRESHOLD) {
                statuses.push('wholesale');
                explanation.push(
                    `Wholesale: seller acquired on ${recDate(acquisition)} (held ${held} day(s) ≤ ${WHOLESALE_DAYS_THRESHOLD}).`,
                );
            } else {
                explanation.push(
                    `Not wholesale: held ${held ?? '?'} day(s) outside 0–${WHOLESALE_DAYS_THRESHOLD}.`,
                );
            }
        } else {
            explanation.push('Not wholesale: no prior Arms Length tx where the seller was the buyer.');
        }
    }

    // Sold: corporate seller → non-corporate buyer.
    if (sellerIsCorp && !buyerIsCorp) {
        statuses.push('sold');
        explanation.push('Sold: corporate seller → non-corporate buyer.');
    }

    // In-renovation: corporate buyer on the most-recent Arms Length tx.
    if (buyerIsCorp) {
        statuses.push('in-renovation');
        explanation.push('In-renovation: most-recent Arms Length buyer is corporate.');
    }

    if (statuses.length === 0) {
        explanation.push('No status resolved: buyer and seller both non-corporate.');
    }

    return { statuses, mostRecentArmsLength: mostRecentLabel, explanation };
}

// ─── Display helpers ──────────────────────────────────────────────────────────────

/** The pipeline currently drops any tx missing SALE_DATE or RECORDING_DATE on insert. */
function wouldBeDroppedAtInsert(tx: RawTransaction): boolean {
    return !saleDate(tx) || !recDate(tx);
}

function compactLine(tx: RawTransaction): string {
    const amt = salePriceOf(tx);
    const amtLabel = amt != null ? `$${amt.toLocaleString()}` : '—';
    const b2 = buyer2(tx);
    const b2Label = b2 ? ` (+b2: ${b2})` : '';
    return (
        `rec ${recDate(tx) || 'null'} | sale ${saleDate(tx) || 'null'} | ` +
        `${(txType(tx) || 'null').padEnd(30)} | ` +
        `${buyer1(tx) || '—'}${b2Label} ⇐ ${seller1(tx) || '—'} | ${amtLabel}`
    );
}

function buildWarnings(txs: RawTransaction[]): string[] {
    const warnings: string[] = [];

    const dropped = txs.filter(wouldBeDroppedAtInsert);
    for (const tx of dropped) {
        warnings.push(
            `Pipeline currently DROPS at insert (null SALE_DATE or RECORDING_DATE): ${compactLine(tx)}`,
        );
    }

    const withB2 = txs.filter((tx) => buyer2(tx) || seller2(tx));
    if (withB2.length > 0) {
        warnings.push(
            `${withB2.length} transaction(s) carry a borrower-2 / seller-2 name — now CONSIDERED in chain + acquisition matching.`,
        );
    }

    const unknownTypes = Array.from(
        new Set(
            txs
                .map(txType)
                .filter((t) => t && !isArmsLengthType(t) && !isNonArmsLengthType(t)),
        ),
    );
    if (unknownTypes.length > 0) {
        warnings.push(`Other transaction types present (excluded from status): ${unknownTypes.join(', ')}`);
    }

    return warnings;
}

const isArmsLengthType = (t: string) => normalizeType(t) === 'arms length';
const isNonArmsLengthType = (t: string) => normalizeType(t) === 'non arms length';

/** Same-recording-date groups with 2+ transactions — where chain reconstruction acted. */
function sameDateGroups(txs: RawTransaction[]): Record<string, string[]> {
    const groups = new Map<string, RawTransaction[]>();
    for (const tx of txs) {
        const key = recDate(tx) || '(no recording date)';
        const bucket = groups.get(key);
        if (bucket) bucket.push(tx);
        else groups.set(key, [tx]);
    }
    const out: Record<string, string[]> = {};
    for (const key of Array.from(groups.keys())) {
        const group = groups.get(key)!;
        if (group.length > 1) out[key] = orderSameDateGroupDesc(group.map((tx, i) => ({ tx, i }))).map(compactLine);
    }
    return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

function main(): void {
    const inputUrl = new URL('./test.json', import.meta.url);
    const outputUrl = new URL('./output.json', import.meta.url);

    const file = JSON.parse(readFileSync(inputUrl, 'utf-8')) as TransactionsFile | RawTransaction[];
    const data: TransactionsFile = Array.isArray(file) ? { transactions: file } : file;
    const txs = data.transactions ?? [];
    const listingStatus = data.listing_status ?? '';

    const sortedAll = sortTransactionsDesc(txs);
    const armsLengthSorted = sortedAll.filter(isArmsLength);
    const status = resolveStatus(txs, listingStatus);
    const spread = calculateSpread(sortedAll);
    const warnings = buildWarnings(txs);

    const output = {
        property_id: data.property_id ?? null,
        address: data.address ?? null,
        listing_status: listingStatus || '(not provided — assumed off-market)',
        inputTransactionCount: txs.length,

        status: {
            resolved: status.statuses,
            mostRecentArmsLength: status.mostRecentArmsLength,
            explanation: status.explanation,
        },

        // Buyer/seller prices paid + spread (what the upgrade surfaces for the app).
        pricing: {
            buyerPurchasePrice: spread.buyerPurchasePrice,
            buyerPurchaseDate: spread.buyerPurchaseDate,
            sellerPurchasePrice: spread.sellerPurchasePrice,
            sellerPurchaseDate: spread.sellerPurchaseDate,
            spread: spread.spread,
            displayBuyer: spread.latestArmsLengthTx ? buyer1(spread.latestArmsLengthTx) : null,
            displaySeller: spread.latestArmsLengthTx ? seller1(spread.latestArmsLengthTx) : null,
        },

        allTransactionsOrder: sortedAll.map(compactLine),
        armsLengthOrder: armsLengthSorted.map(compactLine),

        // Where chain reconstruction had to decide order (same recording date, 2+ txs).
        sameDateGroupsResolved: sameDateGroups(txs),

        warnings,

        sortedAllTransactions: sortedAll,
    };

    writeFileSync(outputUrl, JSON.stringify(output, null, 4) + '\n', 'utf-8');

    // Console summary
    console.log(`\nProperty ${output.property_id ?? '?'} — ${output.address ?? ''}`);
    console.log(`Input transactions: ${txs.length}\n`);
    console.log(`STATUS: ${status.statuses.length ? status.statuses.join(' + ') : '(none)'}`);
    status.explanation.forEach((e) => console.log(`  • ${e}`));
    console.log(`\nPRICING:`);
    console.log(`  buyer paid:  ${fmtMoney(spread.buyerPurchasePrice)} (${spread.buyerPurchaseDate ?? '—'})`);
    console.log(`  seller paid: ${fmtMoney(spread.sellerPurchasePrice)} (${spread.sellerPurchaseDate ?? '—'})`);
    console.log(`  spread:      ${fmtMoney(spread.spread)}`);
    console.log(`\nAll transactions order (most-recent-first):`);
    output.allTransactionsOrder.forEach((l, i) => console.log(`  [${i + 1}] ${l}`));
    if (warnings.length) {
        console.log(`\nWarnings:`);
        warnings.forEach((w) => console.log(`  ⚠ ${w}`));
    }
    console.log(`\n→ wrote ${outputUrl.pathname.replace(/^\//, '')}`);
}

function fmtMoney(n: number | null): string {
    return n != null ? `$${n.toLocaleString()}` : '—';
}

main();
