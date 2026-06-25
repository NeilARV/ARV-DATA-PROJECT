import { describe, it, expect } from 'vitest';
import {
    sortTransactionsDesc,
    calculateSpread,
    computeSaleRatios,
    isArmsLength,
} from '../../../server/utils/orderTransactions';

/** Buyer name across either naming convention (mapped camelCase or raw SFR UPPERCASE). */
const buyers = (rows: Record<string, unknown>[]): unknown[] =>
    rows.map((r) => r.buyerName ?? r.BUYER_BORROWER1_NAME);

function logSortResult(
    label: string,
    result: Array<{
        recordingDate?: unknown;
        saleDate?: unknown;
        transactionType?: unknown;
        buyerName?: unknown;
        sellerName?: unknown;
        salePrice?: unknown;
    }>,
) {
    console.log(`\n── ${label} ──`);
    result.forEach((tx, i) => {
        console.log(
            `  [${i + 1}] ${String(tx.transactionType ?? '').padEnd(35)}` +
                ` rec=${tx.recordingDate ?? 'null'} sale=${tx.saleDate ?? 'null'}` +
                ` | buyer=${tx.buyerName ?? '—'} seller=${tx.sellerName ?? '—'}` +
                (tx.salePrice ? ` $${Number(tx.salePrice).toLocaleString()}` : ''),
        );
    });
}

describe('sortTransactionsDesc', () => {
    describe('basic ordering', () => {
        it('sorts by recording_date DESC when all dates are distinct', () => {
            const txs = [
                {
                    recordingDate: '2020-01-01',
                    buyerName: 'A',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
                {
                    recordingDate: '2022-06-15',
                    buyerName: 'B',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
                {
                    recordingDate: '2021-03-10',
                    buyerName: 'C',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
            ];
            const result = sortTransactionsDesc(txs);
            expect(result.map((t) => t.recordingDate)).toEqual([
                '2022-06-15',
                '2021-03-10',
                '2020-01-01',
            ]);
        });

        it('returns a copy and does not mutate the original array', () => {
            const txs = [
                {
                    recordingDate: '2021-01-01',
                    buyerName: 'A',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
                {
                    recordingDate: '2022-01-01',
                    buyerName: 'B',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
            ];
            const original = [...txs];
            sortTransactionsDesc(txs);
            expect(txs).toEqual(original);
        });

        it('returns single-element arrays unchanged', () => {
            const txs = [
                {
                    recordingDate: '2022-01-01',
                    buyerName: 'A',
                    sellerName: null,
                    transactionType: 'Arms Length',
                },
            ];
            expect(sortTransactionsDesc(txs)).toHaveLength(1);
        });
    });

    describe('wholesale | same recording date | order by chain transactions', () => {
        it('incorrect order | same recording date | swap [1] and [2]', () => {
            // Simultaneous close: STARK LLC bought from NICK FURY, then immediately sold to ROGERS LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API returned STARK LLC (seller tx) before ROGERS LLC (buyer tx) — wrong chain order.
            // Chain detection: ROGERS LLC's seller === STARK LLC's buyer → STARK LLC is older in the chain.
            const txs = [
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-08',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BANNER FAMILY TRUST',
                    sellerName: 'PEPPER POTTS',
                    salePrice: '0',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-02',
                    transactionType: 'Arms Length',
                    buyerName: 'STARK LLC',
                    sellerName: 'BRUCE BANNER',
                    salePrice: '1340000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-01',
                    transactionType: 'Arms Length',
                    buyerName: 'ROGERS LLC',
                    sellerName: 'STARK LLC',
                    salePrice: '1350000',
                },
                {
                    recordingDate: '2004-10-21',
                    saleDate: '2004-09-24',
                    transactionType: 'HELOCS',
                    buyerName: 'BRUCE BANNER',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2004-06-14',
                    saleDate: '2004-06-09',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BRUCE BANNER',
                    sellerName: 'CAROL BANNER',
                    salePrice: '0',
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult(
                'Sorted Result (STARK LLC is buyer on Tx 3 | STARK LLC is seller on Tx 2)',
                result,
            );
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf('ROGERS LLC');
            const starkIdx = buyers.indexOf('STARK LLC');
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-01',
                transactionType: 'Arms Length',
                buyerName: 'ROGERS LLC',
                sellerName: 'STARK LLC',
                salePrice: '1350000',
            });
            expect(result[1]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-02',
                transactionType: 'Arms Length',
                buyerName: 'STARK LLC',
                sellerName: 'BRUCE BANNER',
                salePrice: '1340000',
            });
            expect(result[2]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-08',
                transactionType: 'Non-Arms Length',
                buyerName: 'BANNER FAMILY TRUST',
                sellerName: 'PEPPER POTTS',
                salePrice: '0',
            });
            expect(result[3]).toEqual({
                recordingDate: '2004-10-21',
                saleDate: '2004-09-24',
                transactionType: 'HELOCS',
                buyerName: 'BRUCE BANNER',
                sellerName: null,
                salePrice: null,
            });
            expect(result[4]).toEqual({
                recordingDate: '2004-06-14',
                saleDate: '2004-06-09',
                transactionType: 'Non-Arms Length',
                buyerName: 'BRUCE BANNER',
                sellerName: 'CAROL BANNER',
                salePrice: '0',
            });
        });

        it('in correct order | swaps [0] with [1]', () => {
            // Simultaneous close: ROGERS LLC bought from THOR ODINSON, then immediately sold to STARK LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API returned ROGERS LLC (wholesaler) first — wrong chain order.
            // Chain detection: STARK LLC's seller === ROGERS LLC's buyer → ROGERS LLC is older.
            const txs = [
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-02',
                    transactionType: 'Arms Length',
                    buyerName: 'STARK LLC',
                    sellerName: 'BRUCE BANNER',
                    salePrice: '1340000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-01',
                    transactionType: 'Arms Length',
                    buyerName: 'ROGERS LLC',
                    sellerName: 'STARK LLC',
                    salePrice: '1350000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-08',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BANNER FAMILY TRUST',
                    sellerName: 'PEPPER POTTS',
                    salePrice: '0',
                },
                {
                    recordingDate: '2004-10-21',
                    saleDate: '2004-09-24',
                    transactionType: 'HELOCS',
                    buyerName: 'BRUCE BANNER',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2004-06-14',
                    saleDate: '2004-06-09',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BRUCE BANNER',
                    sellerName: 'CAROL BANNER',
                    salePrice: '0',
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult(
                'Sorted Result (ROGERS LLC is buyer on Tx 1 | ROGERS LLC is seller on Tx 2)',
                result,
            );
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf('ROGERS LLC');
            const starkIdx = buyers.indexOf('STARK LLC');
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-01',
                transactionType: 'Arms Length',
                buyerName: 'ROGERS LLC',
                sellerName: 'STARK LLC',
                salePrice: '1350000',
            });
            expect(result[1]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-02',
                transactionType: 'Arms Length',
                buyerName: 'STARK LLC',
                sellerName: 'BRUCE BANNER',
                salePrice: '1340000',
            });
            expect(result[2]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-08',
                transactionType: 'Non-Arms Length',
                buyerName: 'BANNER FAMILY TRUST',
                sellerName: 'PEPPER POTTS',
                salePrice: '0',
            });
            expect(result[3]).toEqual({
                recordingDate: '2004-10-21',
                saleDate: '2004-09-24',
                transactionType: 'HELOCS',
                buyerName: 'BRUCE BANNER',
                sellerName: null,
                salePrice: null,
            });
            expect(result[4]).toEqual({
                recordingDate: '2004-06-14',
                saleDate: '2004-06-09',
                transactionType: 'Non-Arms Length',
                buyerName: 'BRUCE BANNER',
                sellerName: 'CAROL BANNER',
                salePrice: '0',
            });
        });

        it('correct order | different sale dates in correct order', () => {
            // Simultaneous close: ROGERS LLC bought from THOR ODINSON, then immediately sold to STARK LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API happened to return STARK LLC (end buyer) first — already correct chain order.
            // Chain detection: STARK LLC's seller === ROGERS LLC's buyer → ROGERS LLC is older.
            const txs = [
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-01',
                    transactionType: 'Arms Length',
                    buyerName: 'ROGERS LLC',
                    sellerName: 'STARK LLC',
                    salePrice: '1350000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-02',
                    transactionType: 'Arms Length',
                    buyerName: 'STARK LLC',
                    sellerName: 'BRUCE BANNER',
                    salePrice: '1340000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-08',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BANNER FAMILY TRUST',
                    sellerName: 'PEPPER POTTS',
                    salePrice: '0',
                },
                {
                    recordingDate: '2004-10-21',
                    saleDate: '2004-09-24',
                    transactionType: 'HELOCS',
                    buyerName: 'BRUCE BANNER',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2004-06-14',
                    saleDate: '2004-06-09',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'BRUCE BANNER',
                    sellerName: 'CAROL BANNER',
                    salePrice: '0',
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult(
                'Sorted Result (ROGERS LLC is buyer on Tx 2 | ROGERS LLC is seller on Tx 1)',
                result,
            );
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf('ROGERS LLC');
            const starkIdx = buyers.indexOf('STARK LLC');
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-01',
                transactionType: 'Arms Length',
                buyerName: 'ROGERS LLC',
                sellerName: 'STARK LLC',
                salePrice: '1350000',
            });
            expect(result[1]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-02',
                transactionType: 'Arms Length',
                buyerName: 'STARK LLC',
                sellerName: 'BRUCE BANNER',
                salePrice: '1340000',
            });
            expect(result[2]).toEqual({
                recordingDate: '2026-04-15',
                saleDate: '2026-04-08',
                transactionType: 'Non-Arms Length',
                buyerName: 'BANNER FAMILY TRUST',
                sellerName: 'PEPPER POTTS',
                salePrice: '0',
            });
            expect(result[3]).toEqual({
                recordingDate: '2004-10-21',
                saleDate: '2004-09-24',
                transactionType: 'HELOCS',
                buyerName: 'BRUCE BANNER',
                sellerName: null,
                salePrice: null,
            });
            expect(result[4]).toEqual({
                recordingDate: '2004-06-14',
                saleDate: '2004-06-09',
                transactionType: 'Non-Arms Length',
                buyerName: 'BRUCE BANNER',
                sellerName: 'CAROL BANNER',
                salePrice: '0',
            });
        });

        it('Arms Length sale comes before prior Non-Arms Length transfer on same recording date', () => {
            // FURY NICHOLAS E transferred to ROMANOFF NATASHA K (Non-Arms Length, $0) on 2026-02-10,
            // then ROMANOFF NATASHA K immediately sold to PARKER HOLDINGS LTD (Arms Length) on the same
            // recording date. SFR returned the Non-Arms Length transfer first — chain detection fires
            // (PARKER's seller === ROMANOFF's buyer) and Arms Length priority both agree: PARKER comes first.
            const txs = [
                {
                    recordingDate: '2026-02-26',
                    saleDate: '2026-02-20',
                    transactionType: 'Arms Length',
                    buyerName: 'DANVERS CAROL M',
                    sellerName: 'PARKER HOLDINGS LTD',
                    salePrice: '600000',
                },
                {
                    recordingDate: '2026-02-10',
                    saleDate: '2026-02-09',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'ROMANOFF NATASHA K',
                    sellerName: 'FURY NICHOLAS E',
                    salePrice: '0',
                },
                {
                    recordingDate: '2026-02-10',
                    saleDate: '2026-02-10',
                    transactionType: 'Arms Length',
                    buyerName: 'PARKER HOLDINGS LTD',
                    sellerName: 'ROMANOFF NATASHA K',
                    salePrice: '502500',
                },
                {
                    recordingDate: '2025-10-28',
                    saleDate: '2025-10-27',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'FOSTER JANE S',
                    sellerName: 'FURY MARIA PATRICIA',
                    salePrice: '0',
                },
                {
                    recordingDate: '2021-08-18',
                    saleDate: '2021-08-13',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'FURY MARIA P',
                    sellerName: 'FURY MARIA P',
                    salePrice: '0',
                },
                {
                    recordingDate: '2018-09-13',
                    saleDate: '2018-08-15',
                    transactionType: 'Non-Arms Length',
                    buyerName: 'FURY NICHOLAS E E',
                    sellerName: 'FURY NICHOLAS ERROLL',
                    salePrice: '0',
                },
                {
                    recordingDate: '2016-09-30',
                    saleDate: null,
                    transactionType: null,
                    buyerName: 'FURY N E',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2012-08-30',
                    saleDate: '2012-08-21',
                    transactionType: 'REFI LOANS and 2ND TRUST DEEDS',
                    buyerName: 'FURY NICHOLAS E',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2003-04-21',
                    saleDate: '2003-04-14',
                    transactionType: 'REFI LOANS and 2ND TRUST DEEDS',
                    buyerName: 'FURY NICHOLAS E',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '2002-09-13',
                    saleDate: null,
                    transactionType: 'HELOCS',
                    buyerName: 'FURY NICHOLAS E',
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: '1998-02-04',
                    saleDate: null,
                    transactionType: 'HELOCS',
                    buyerName: 'FURY NICHOLAS E',
                    sellerName: null,
                    salePrice: null,
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult(
                'Arms Length sale before Non-Arms Length transfer (same recording date)',
                result,
            );

            // Core assertion: PARKER HOLDINGS LTD (end buyer, Arms Length) before ROMANOFF NATASHA K (Non-Arms Length transfer)
            const parkerIdx = result.findIndex((t) => t.buyerName === 'PARKER HOLDINGS LTD');
            const romanoffIdx = result.findIndex((t) => t.buyerName === 'ROMANOFF NATASHA K');
            expect(parkerIdx).toBeLessThan(romanoffIdx);

            // Full expected order
            expect(result[0]).toEqual({
                recordingDate: '2026-02-26',
                saleDate: '2026-02-20',
                transactionType: 'Arms Length',
                buyerName: 'DANVERS CAROL M',
                sellerName: 'PARKER HOLDINGS LTD',
                salePrice: '600000',
            });
            expect(result[1]).toEqual({
                recordingDate: '2026-02-10',
                saleDate: '2026-02-10',
                transactionType: 'Arms Length',
                buyerName: 'PARKER HOLDINGS LTD',
                sellerName: 'ROMANOFF NATASHA K',
                salePrice: '502500',
            });
            expect(result[2]).toEqual({
                recordingDate: '2026-02-10',
                saleDate: '2026-02-09',
                transactionType: 'Non-Arms Length',
                buyerName: 'ROMANOFF NATASHA K',
                sellerName: 'FURY NICHOLAS E',
                salePrice: '0',
            });
            expect(result[3]).toEqual({
                recordingDate: '2025-10-28',
                saleDate: '2025-10-27',
                transactionType: 'Non-Arms Length',
                buyerName: 'FOSTER JANE S',
                sellerName: 'FURY MARIA PATRICIA',
                salePrice: '0',
            });
            expect(result[4]).toEqual({
                recordingDate: '2021-08-18',
                saleDate: '2021-08-13',
                transactionType: 'Non-Arms Length',
                buyerName: 'FURY MARIA P',
                sellerName: 'FURY MARIA P',
                salePrice: '0',
            });
            expect(result[5]).toEqual({
                recordingDate: '2018-09-13',
                saleDate: '2018-08-15',
                transactionType: 'Non-Arms Length',
                buyerName: 'FURY NICHOLAS E E',
                sellerName: 'FURY NICHOLAS ERROLL',
                salePrice: '0',
            });
            expect(result[6]).toEqual({
                recordingDate: '2016-09-30',
                saleDate: null,
                transactionType: null,
                buyerName: 'FURY N E',
                sellerName: null,
                salePrice: null,
            });
            expect(result[7]).toEqual({
                recordingDate: '2012-08-30',
                saleDate: '2012-08-21',
                transactionType: 'REFI LOANS and 2ND TRUST DEEDS',
                buyerName: 'FURY NICHOLAS E',
                sellerName: null,
                salePrice: null,
            });
            expect(result[8]).toEqual({
                recordingDate: '2003-04-21',
                saleDate: '2003-04-14',
                transactionType: 'REFI LOANS and 2ND TRUST DEEDS',
                buyerName: 'FURY NICHOLAS E',
                sellerName: null,
                salePrice: null,
            });
            expect(result[9]).toEqual({
                recordingDate: '2002-09-13',
                saleDate: null,
                transactionType: 'HELOCS',
                buyerName: 'FURY NICHOLAS E',
                sellerName: null,
                salePrice: null,
            });
            expect(result[10]).toEqual({
                recordingDate: '1998-02-04',
                saleDate: null,
                transactionType: 'HELOCS',
                buyerName: 'FURY NICHOLAS E',
                sellerName: null,
                salePrice: null,
            });
        });

        it('preserves original order when same recording_date, same type, and no chain relationship', () => {
            const txs = [
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-01',
                    transactionType: 'Arms Length',
                    buyerName: 'BUYER A',
                    sellerName: 'SELLER X',
                    salePrice: '500000',
                },
                {
                    recordingDate: '2026-04-15',
                    saleDate: '2026-04-10',
                    transactionType: 'Arms Length',
                    buyerName: 'BUYER B',
                    sellerName: 'SELLER Y',
                    salePrice: '600000',
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult('No chain relationship — original order preserved', result);
            // No chain relationship, same type, same recording_date → original order preserved
            expect(result[0].buyerName).toBe('BUYER A');
            expect(result[1].buyerName).toBe('BUYER B');
        });
    });
});

describe('sortTransactionsDesc — chain reconstruction (upgraded)', () => {
    it('resolves a 3-link same-date chain most-recent-first regardless of input order', () => {
        // Same recording date 2026-04-15. True chain: ALSTON → RIVERA → SUMMIT → GARCIA.
        // Expected most-recent-first: GARCIA (end buyer), SUMMIT, RIVERA.
        const t1 = {
            buyerName: 'RIVERA FLIP LLC',
            sellerName: 'ALSTON MARY',
            recordingDate: '2026-04-15',
            salePrice: '400000',
            transactionType: 'Arms Length',
        };
        const t2 = {
            buyerName: 'SUMMIT VENTURES LLC',
            sellerName: 'RIVERA FLIP LLC',
            recordingDate: '2026-04-15',
            salePrice: '450000',
            transactionType: 'Arms Length',
        };
        const t3 = {
            buyerName: 'GARCIA LUIS',
            sellerName: 'SUMMIT VENTURES LLC',
            recordingDate: '2026-04-15',
            salePrice: '620000',
            transactionType: 'Arms Length',
        };
        const expected = ['GARCIA LUIS', 'SUMMIT VENTURES LLC', 'RIVERA FLIP LLC'];

        // Every input permutation must produce the same correct order — this is the
        // property the old pairwise comparator failed (non-transitive for 3+ links).
        for (const perm of [
            [t1, t2, t3],
            [t3, t2, t1],
            [t2, t1, t3],
            [t3, t1, t2],
            [t2, t3, t1],
        ]) {
            expect(buyers(sortTransactionsDesc(perm))).toEqual(expected);
        }
    });

    it('chain order wins over misleading sale dates', () => {
        // The resale has an EARLIER sale_date than the purchase (SFR sale dates are
        // unreliable). Chain must still place the resale (END BUYER) as most recent.
        const tBuy = {
            buyerName: 'FLIP LLC',
            sellerName: 'SELLER A',
            saleDate: '2026-04-10',
            recordingDate: '2026-04-15',
            salePrice: '400000',
            transactionType: 'Arms Length',
        };
        const tResale = {
            buyerName: 'END BUYER',
            sellerName: 'FLIP LLC',
            saleDate: '2026-04-01',
            recordingDate: '2026-04-15',
            salePrice: '500000',
            transactionType: 'Arms Length',
        };
        expect(buyers(sortTransactionsDesc([tBuy, tResale]))).toEqual(['END BUYER', 'FLIP LLC']);
    });

    it('keeps recording_date DESC with HELOC/REFI interspersed', () => {
        const txs = [
            { buyerName: 'L', recordingDate: '2026-01-10', transactionType: 'Arms Length' },
            { buyerName: 'H', recordingDate: '2020-05-01', transactionType: 'HELOCS' },
            {
                buyerName: 'R',
                recordingDate: '2018-03-01',
                transactionType: 'REFI LOANS and 2ND TRUST DEEDS',
            },
            { buyerName: 'O', recordingDate: '2015-06-01', transactionType: 'Arms Length' },
        ];
        expect(buyers(sortTransactionsDesc(txs))).toEqual(['L', 'H', 'R', 'O']);
    });

    it('places an Arms Length sale before a HELOC on the same recording date', () => {
        const txs = [
            { buyerName: 'H', recordingDate: '2026-01-01', transactionType: 'HELOCS' },
            {
                buyerName: 'A',
                sellerName: 'S',
                recordingDate: '2026-01-01',
                transactionType: 'Arms Length',
            },
        ];
        expect(buyers(sortTransactionsDesc(txs))).toEqual(['A', 'H']);
    });

    it('sorts transactions with no recording date last', () => {
        const txs = [
            { buyerName: 'N', transactionType: 'Arms Length' },
            { buyerName: 'A', recordingDate: '2026-01-01', transactionType: 'Arms Length' },
        ];
        expect(buyers(sortTransactionsDesc(txs))).toEqual(['A', 'N']);
    });

    it('links a chain across normalized names ("THE … & …" vs "… AND …")', () => {
        const t1 = {
            buyerName: 'THE SMITH FAMILY TRUST',
            sellerName: 'JONES BOB',
            recordingDate: '2026-03-03',
            salePrice: '0',
            transactionType: 'Non-Arms Length',
        };
        const t2 = {
            buyerName: 'BUYER LLC',
            sellerName: 'SMITH FAMILY TRUST',
            recordingDate: '2026-03-03',
            salePrice: '500000',
            transactionType: 'Arms Length',
        };
        expect(buyers(sortTransactionsDesc([t1, t2]))).toEqual([
            'BUYER LLC',
            'THE SMITH FAMILY TRUST',
        ]);
    });

    it('links a chain via BUYER_BORROWER2_NAME on the raw SFR shape', () => {
        const t1 = {
            BUYER_BORROWER1_NAME: 'PRIMARY OWNER',
            BUYER_BORROWER2_NAME: 'JANE CO LLC',
            SELLER1_NAME: 'ORIGINAL',
            RECORDING_DATE: '2026-03-03',
            SALE_AMT: '300000',
            TRANSACTION_TYPE: 'Arms Length',
        };
        const t2 = {
            BUYER_BORROWER1_NAME: 'NEW BUYER',
            SELLER1_NAME: 'JANE CO LLC',
            RECORDING_DATE: '2026-03-03',
            SALE_AMT: '350000',
            TRANSACTION_TYPE: 'Arms Length',
        };
        // t2's seller (JANE CO LLC) is t1's secondary borrower → t2 is the resale.
        expect(buyers(sortTransactionsDesc([t1, t2]))).toEqual(['NEW BUYER', 'PRIMARY OWNER']);
    });

    it('links a chain via company id when names differ', () => {
        const t1 = {
            buyerName: 'ACME HOLDINGS LLC',
            buyerId: 'co-1',
            sellerName: 'SELLER A',
            recordingDate: '2026-02-02',
            salePrice: '400000',
            transactionType: 'Arms Length',
        };
        const t2 = {
            buyerName: 'END BUYER',
            sellerName: 'ACME HOLDINGS INC',
            sellerId: 'co-1',
            recordingDate: '2026-02-02',
            salePrice: '500000',
            transactionType: 'Arms Length',
        };
        // Names differ ("LLC" vs "INC") but the company id links the chain.
        expect(buyers(sortTransactionsDesc([t1, t2]))).toEqual(['END BUYER', 'ACME HOLDINGS LLC']);
    });
});

describe('isArmsLength — tolerant type matching', () => {
    it.each(['Arms Length', 'arms length', 'ARMS LENGTH', "Arm's Length", 'Arms-Length'])(
        'treats "%s" as Arms Length',
        (type) => {
            expect(isArmsLength({ transactionType: type })).toBe(true);
        },
    );

    it.each(['Non-Arms Length', 'HELOCS', 'REFI LOANS and 2ND TRUST DEEDS', 'REO', ''])(
        'treats "%s" as NOT Arms Length',
        (type) => {
            expect(isArmsLength({ transactionType: type })).toBe(false);
        },
    );

    it('reads the raw SFR TRANSACTION_TYPE key too', () => {
        expect(isArmsLength({ TRANSACTION_TYPE: 'Arms Length' })).toBe(true);
    });
});

describe('calculateSpread', () => {
    it('computes buyer/seller price and spread for a simple flip', () => {
        const t1 = {
            buyerName: 'FLIP LLC',
            sellerName: 'SELLER A',
            recordingDate: '2026-01-01',
            salePrice: '400000',
            transactionType: 'Arms Length',
        };
        const t2 = {
            buyerName: 'END BUYER',
            sellerName: 'FLIP LLC',
            recordingDate: '2026-02-01',
            salePrice: '500000',
            transactionType: 'Arms Length',
        };
        // Input intentionally unsorted — calculateSpread re-sorts internally.
        const result = calculateSpread([t1, t2]);
        expect(result.buyerPurchasePrice).toBe(500000);
        expect(result.buyerPurchaseDate).toBe('2026-02-01');
        expect(result.sellerPurchasePrice).toBe(400000);
        expect(result.sellerPurchaseDate).toBe('2026-01-01');
        expect(result.spread).toBe(100000);
        expect(result.latestArmsLengthTx?.buyerName).toBe('END BUYER');
    });

    it("traces the seller's acquisition through a Non-Arms Length transfer", () => {
        const t1 = {
            buyerName: 'INDIV OWNER',
            sellerName: 'BANK',
            recordingDate: '2020-01-01',
            salePrice: '200000',
            transactionType: 'Arms Length',
        };
        const t2 = {
            buyerName: 'INDIV OWNER LLC',
            sellerName: 'INDIV OWNER',
            recordingDate: '2026-01-01',
            salePrice: '0',
            transactionType: 'Non-Arms Length',
        };
        const t3 = {
            buyerName: 'END BUYER',
            sellerName: 'INDIV OWNER LLC',
            recordingDate: '2026-02-01',
            salePrice: '350000',
            transactionType: 'Arms Length',
        };
        const result = calculateSpread([t1, t2, t3]);
        expect(result.buyerPurchasePrice).toBe(350000);
        // Seller (INDIV OWNER LLC) acquired via a $0 transfer from INDIV OWNER, whose
        // own Arms Length purchase was $200k → that is the true acquisition price.
        expect(result.sellerPurchasePrice).toBe(200000);
        expect(result.spread).toBe(150000);
    });

    it('skips a HELOC when tracing the acquisition price', () => {
        const t1 = {
            buyerName: 'FLIP LLC',
            sellerName: 'ORIG',
            recordingDate: '2025-01-01',
            salePrice: '300000',
            transactionType: 'Arms Length',
        };
        const t2 = {
            buyerName: 'FLIP LLC',
            recordingDate: '2025-06-01',
            salePrice: '0',
            transactionType: 'HELOCS',
        };
        const t3 = {
            buyerName: 'END',
            sellerName: 'FLIP LLC',
            recordingDate: '2026-01-01',
            salePrice: '420000',
            transactionType: 'Arms Length',
        };
        const result = calculateSpread([t1, t2, t3]);
        // The $0 HELOC must NOT be taken as the acquisition — the $300k Arms Length is.
        expect(result.sellerPurchasePrice).toBe(300000);
        expect(result.spread).toBe(120000);
    });

    it('returns nulls but still exposes latestArmsLengthTx when no priced Arms Length exists', () => {
        const onlyZeroAl = calculateSpread([
            {
                buyerName: 'X',
                recordingDate: '2020-01-01',
                salePrice: '0',
                transactionType: 'Arms Length',
            },
        ]);
        expect(onlyZeroAl.buyerPurchasePrice).toBeNull();
        expect(onlyZeroAl.spread).toBeNull();
        expect(onlyZeroAl.latestArmsLengthTx?.buyerName).toBe('X');

        const noAl = calculateSpread([
            { buyerName: 'X', recordingDate: '2020-01-01', transactionType: 'HELOCS' },
        ]);
        expect(noAl.latestArmsLengthTx).toBeNull();
        expect(noAl.buyerPurchasePrice).toBeNull();
    });

    it('works on the raw SFR shape (SALE_AMT / BUYER_BORROWER1_NAME)', () => {
        const t1 = {
            BUYER_BORROWER1_NAME: 'FLIP LLC',
            SELLER1_NAME: 'SELLER A',
            RECORDING_DATE: '2026-01-01',
            SALE_AMT: '400000',
            TRANSACTION_TYPE: 'Arms Length',
        };
        const t2 = {
            BUYER_BORROWER1_NAME: 'END',
            SELLER1_NAME: 'FLIP LLC',
            RECORDING_DATE: '2026-02-01',
            SALE_AMT: '500000',
            TRANSACTION_TYPE: 'Arms Length',
        };
        const result = calculateSpread([t1, t2]);
        expect(result.buyerPurchasePrice).toBe(500000);
        expect(result.sellerPurchasePrice).toBe(400000);
        expect(result.spread).toBe(100000);
    });
});

describe('computeSaleRatios', () => {
    it('computeSaleRatios — simple flip — one ratio credited to the seller', () => {
        // A buys at 200k, sells at 280k. Only A's sale has a traceable acquisition.
        const ratios = computeSaleRatios([
            {
                recordingDate: '2020-01-01',
                transactionType: 'Arms Length',
                salePrice: '200000',
                sellerId: 'S',
                buyerId: 'A',
            },
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '280000',
                sellerId: 'A',
                buyerId: 'B',
            },
        ]);
        expect(ratios).toHaveLength(1);
        expect(ratios[0]).toMatchObject({ sellerId: 'A', purchasePrice: 200000, soldPrice: 280000 });
        expect(ratios[0].ratio).toBeCloseTo(0.7143, 4);
    });

    it('computeSaleRatios — property re-flipped — each seller keeps its own data point', () => {
        // A->B (280k) then B->C (350k): a later re-flip must not erase A's ratio.
        const ratios = computeSaleRatios([
            {
                recordingDate: '2020-01-01',
                transactionType: 'Arms Length',
                salePrice: '200000',
                sellerId: 'S',
                buyerId: 'A',
            },
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '280000',
                sellerId: 'A',
                buyerId: 'B',
            },
            {
                recordingDate: '2022-01-01',
                transactionType: 'Arms Length',
                salePrice: '350000',
                sellerId: 'B',
                buyerId: 'C',
            },
        ]);
        // Returned most-recent sale first: B's flip, then A's.
        expect(ratios.map((r) => r.sellerId)).toEqual(['B', 'A']);
        expect(ratios[0].ratio).toBeCloseTo(0.8, 4);
        expect(ratios[1].ratio).toBeCloseTo(0.7143, 4);
    });

    it("computeSaleRatios — Non-Arms Length transfer — traces the seller's true acquisition", () => {
        // A buys 200k, transfers to A-LLC ($0), A-LLC sells 300k. A-LLC's true cost is the 200k buy.
        const ratios = computeSaleRatios([
            {
                recordingDate: '2020-01-01',
                transactionType: 'Arms Length',
                salePrice: '200000',
                sellerId: 'S',
                buyerId: 'A',
            },
            {
                recordingDate: '2020-06-01',
                transactionType: 'Non Arms Length',
                salePrice: '0',
                sellerId: 'A',
                buyerId: 'A-LLC',
            },
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '300000',
                sellerId: 'A-LLC',
                buyerId: 'B',
            },
        ]);
        expect(ratios).toHaveLength(1);
        expect(ratios[0]).toMatchObject({ sellerId: 'A-LLC', purchasePrice: 200000, soldPrice: 300000 });
        expect(ratios[0].ratio).toBeCloseTo(0.6667, 4);
    });

    it('computeSaleRatios — no acquisition on record — excludes the sale (not zero)', () => {
        const ratios = computeSaleRatios([
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '300000',
                sellerId: 'A',
                buyerId: 'B',
            },
        ]);
        expect(ratios).toEqual([]);
    });

    it('computeSaleRatios — sale price is 0 — excludes the sale', () => {
        const ratios = computeSaleRatios([
            {
                recordingDate: '2020-01-01',
                transactionType: 'Arms Length',
                salePrice: '200000',
                sellerId: 'S',
                buyerId: 'A',
            },
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '0',
                sellerId: 'A',
                buyerId: 'B',
            },
        ]);
        expect(ratios).toEqual([]);
    });

    it('computeSaleRatios — empty input — returns []', () => {
        expect(computeSaleRatios([])).toEqual([]);
    });

    it('computeSaleRatios — seller has no company id — matches by name, sellerId is null', () => {
        const ratios = computeSaleRatios([
            {
                recordingDate: '2020-01-01',
                transactionType: 'Arms Length',
                salePrice: '200000',
                sellerName: 'ORIG',
                buyerName: 'A',
            },
            {
                recordingDate: '2021-01-01',
                transactionType: 'Arms Length',
                salePrice: '280000',
                sellerName: 'A',
                buyerName: 'B',
            },
        ]);
        expect(ratios).toHaveLength(1);
        expect(ratios[0].sellerId).toBeNull();
        expect(ratios[0].ratio).toBeCloseTo(0.7143, 4);
    });

    it('computeSaleRatios — raw SFR shape (SALE_AMT / *_NAME) — works', () => {
        const ratios = computeSaleRatios([
            {
                RECORDING_DATE: '2020-01-01',
                TRANSACTION_TYPE: 'Arms Length',
                SALE_AMT: '400000',
                SELLER1_NAME: 'ORIG',
                BUYER_BORROWER1_NAME: 'FLIP LLC',
            },
            {
                RECORDING_DATE: '2021-01-01',
                TRANSACTION_TYPE: 'Arms Length',
                SALE_AMT: '500000',
                SELLER1_NAME: 'FLIP LLC',
                BUYER_BORROWER1_NAME: 'END',
            },
        ]);
        expect(ratios).toHaveLength(1);
        expect(ratios[0]).toMatchObject({ purchasePrice: 400000, soldPrice: 500000 });
        expect(ratios[0].ratio).toBeCloseTo(0.8, 4);
    });
});
