import { describe, it, expect } from "vitest";
import { sortTransactionsDesc } from "../../../server/utils/orderTransactions";

describe("sortTransactionsDesc", () => {
    describe("basic ordering", () => {
        it("sorts by recording_date DESC when all dates are distinct", () => {
            const txs = [
                { recordingDate: "2020-01-01", buyerName: "A", sellerName: null, transactionType: "Arms Length" },
                { recordingDate: "2022-06-15", buyerName: "B", sellerName: null, transactionType: "Arms Length" },
                { recordingDate: "2021-03-10", buyerName: "C", sellerName: null, transactionType: "Arms Length" },
            ];
            const result = sortTransactionsDesc(txs);
            expect(result.map((t) => t.recordingDate)).toEqual([
                "2022-06-15",
                "2021-03-10",
                "2020-01-01",
            ]);
        });

        it("returns a copy and does not mutate the original array", () => {
            const txs = [
                { recordingDate: "2021-01-01", buyerName: "A", sellerName: null, transactionType: "Arms Length" },
                { recordingDate: "2022-01-01", buyerName: "B", sellerName: null, transactionType: "Arms Length" },
            ];
            const original = [...txs];
            sortTransactionsDesc(txs);
            expect(txs).toEqual(original);
        });

        it("returns single-element arrays unchanged", () => {
            const txs = [{ recordingDate: "2022-01-01", buyerName: "A", sellerName: null, transactionType: "Arms Length" }];
            expect(sortTransactionsDesc(txs)).toHaveLength(1);
        });
    });

    describe("chain detection on same recording date", () => {
        it("7079 Enders Ave: places WAYNE LLC (end buyer) before STARK LLC (wholesaler) even though API returned them in wrong chain order", () => {
            // Simultaneous close: SD VREV bought from RON WEASLEY, then immediately sold to WAYNE LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API returned SD VREV (seller tx) before LMP 1 (buyer tx) — wrong chain order.
            // Chain detection: LMP 1's seller === SD VREV's buyer → SD VREV is older in the chain.
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-08",
                    transactionType: "Non-Arms Length",
                    buyerName: "SKYWALKER FAMILY TRUST",
                    sellerName: "GINNY WEASLEY",
                    salePrice: "0",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-02",
                    transactionType: "Arms Length",
                    buyerName: "STARK LLC",
                    sellerName: "RON WEASLEY",
                    salePrice: "1340000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-01",
                    transactionType: "Arms Length",
                    buyerName: "WAYNE LLC",
                    sellerName: "STARK LLC",
                    salePrice: "1350000",
                },
                {
                    recordingDate: "2004-10-21",
                    saleDate: "2004-09-24",
                    transactionType: "HELOCS",
                    buyerName: "SLAUGHTER THOMAS D",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2004-06-14",
                    saleDate: "2004-06-09",
                    transactionType: "Non-Arms Length",
                    buyerName: "SLAUGHTER THOMAS D",
                    sellerName: "SLAUGHTER THOMAS D",
                    salePrice: "0",
                },
            ];

            const result = sortTransactionsDesc(txs);
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: WAYNE LLC (end buyer) must appear before STARK LLC (wholesaler)
            const lmpIdx = buyers.indexOf("WAYNE LLC");
            const sdvrevIdx = buyers.indexOf("STARK LLC");
            expect(lmpIdx).toBeLessThan(sdvrevIdx);

            // Full expected order
            expect(result[0].buyerName).toBe("SKYWALKER FAMILY TRUST"); // Non-Arms Length wins by sale_date DESC (04-08)
            expect(result[1].buyerName).toBe("WAYNE LLC");              // most recent Arms Length in chain
            expect(result[2].buyerName).toBe("STARK LLC");             // older Arms Length in chain
            expect(result[3].recordingDate).toBe("2004-10-21");
            expect(result[4].recordingDate).toBe("2004-06-14");
        });

        it("6197 Daisy Pl: preserves correct chain order when API already returned transactions in the right sequence", () => {
            // Simultaneous close: REVIVE SOCAL bought from Abarientos, then immediately sold to G&Y.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API happened to return G&Y (end buyer) first — already correct chain order.
            // Chain detection: G&Y's seller === REVIVE SOCAL's buyer → REVIVE SOCAL is older.
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-03-18",
                    transactionType: "Arms Length",
                    buyerName: "STARK LLC",
                    sellerName: "WAYNE LLC",
                    salePrice: "640000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-03-27",
                    transactionType: "Arms Length",
                    buyerName: "WAYNE LLC",
                    sellerName: "HARRY POTTER",
                    salePrice: "635000",
                },
                {
                    recordingDate: "2007-07-03",
                    saleDate: "2007-06-22",
                    transactionType: "REFI LOANS and 2ND TRUST DEEDS",
                    buyerName: "JAMES POTTER",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2006-04-27",
                    saleDate: "2006-02-20",
                    transactionType: "HELOCS",
                    buyerName: "JAMES POTTER",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2006-04-05",
                    saleDate: "2006-03-26",
                    transactionType: "Non-Arms Length",
                    buyerName: "JAMES POTTER",
                    sellerName: "JAMES POTTER",
                    salePrice: "0",
                },
            ];

            const result = sortTransactionsDesc(txs);
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: G&Y (end buyer) must appear before REVIVE SOCAL (wholesaler)
            const gyIdx = buyers.indexOf("STARK LLC");
            const reviveIdx = buyers.indexOf("WAYNE LLC");
            expect(gyIdx).toBeLessThan(reviveIdx);

            // Full expected order
            expect(result[0].buyerName).toBe("STARK LLC"); // most recent Arms Length in chain
            expect(result[1].buyerName).toBe("WAYNE LLC");       // older Arms Length in chain
            expect(result[2].recordingDate).toBe("2007-07-03");
            expect(result[3].recordingDate).toBe("2006-04-27");
            expect(result[4].recordingDate).toBe("2006-04-05");
        });

        it("falls back to sale_date DESC when same recording_date and no chain relationship exists", () => {
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-01",
                    transactionType: "Arms Length",
                    buyerName: "BUYER A",
                    sellerName: "SELLER X",
                    salePrice: "500000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-10",
                    transactionType: "Arms Length",
                    buyerName: "BUYER B",
                    sellerName: "SELLER Y",
                    salePrice: "600000",
                },
            ];

            const result = sortTransactionsDesc(txs);
            // No chain relationship: BUYER B has later sale_date → comes first
            expect(result[0].buyerName).toBe("BUYER B");
            expect(result[1].buyerName).toBe("BUYER A");
        });
    });
});
