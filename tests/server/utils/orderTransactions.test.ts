import { describe, it, expect } from "vitest";
import { sortTransactionsDesc } from "../../../server/utils/orderTransactions";

function logSortResult(label: string, result: Array<{ recordingDate?: unknown; saleDate?: unknown; transactionType?: unknown; buyerName?: unknown; sellerName?: unknown; salePrice?: unknown }>) {
    console.log(`\n── ${label} ──`);
    result.forEach((tx, i) => {
        console.log(
            `  [${i + 1}] ${String(tx.transactionType ?? "").padEnd(35)}` +
            ` rec=${tx.recordingDate ?? "null"} sale=${tx.saleDate ?? "null"}` +
            ` | buyer=${tx.buyerName ?? "—"} seller=${tx.sellerName ?? "—"}` +
            (tx.salePrice ? ` $${Number(tx.salePrice).toLocaleString()}` : "")
        );
    });
}

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

    describe("wholesale | same recording date | order by chain transactions", () => {
        it("incorrect order | same recording date | swap [1] and [2]", () => {
            // Simultaneous close: STARK LLC bought from NICK FURY, then immediately sold to ROGERS LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API returned STARK LLC (seller tx) before ROGERS LLC (buyer tx) — wrong chain order.
            // Chain detection: ROGERS LLC's seller === STARK LLC's buyer → STARK LLC is older in the chain.
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-08",
                    transactionType: "Non-Arms Length",
                    buyerName: "BANNER FAMILY TRUST",
                    sellerName: "PEPPER POTTS",
                    salePrice: "0",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-02",
                    transactionType: "Arms Length",
                    buyerName: "STARK LLC",
                    sellerName: "BRUCE BANNER",
                    salePrice: "1340000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-01",
                    transactionType: "Arms Length",
                    buyerName: "ROGERS LLC",
                    sellerName: "STARK LLC",
                    salePrice: "1350000",
                },
                {
                    recordingDate: "2004-10-21",
                    saleDate: "2004-09-24",
                    transactionType: "HELOCS",
                    buyerName: "BRUCE BANNER",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2004-06-14",
                    saleDate: "2004-06-09",
                    transactionType: "Non-Arms Length",
                    buyerName: "BRUCE BANNER",
                    sellerName: "CAROL BANNER",
                    salePrice: "0",
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult("Sorted Result (STARK LLC is buyer on Tx 3 | STARK LLC is seller on Tx 2)", result);
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf("ROGERS LLC");
            const starkIdx = buyers.indexOf("STARK LLC");
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-01", transactionType: "Arms Length", buyerName: "ROGERS LLC", sellerName: "STARK LLC", salePrice: "1350000" });
            expect(result[1]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-02", transactionType: "Arms Length", buyerName: "STARK LLC", sellerName: "BRUCE BANNER", salePrice: "1340000" });
            expect(result[2]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-08", transactionType: "Non-Arms Length", buyerName: "BANNER FAMILY TRUST", sellerName: "PEPPER POTTS", salePrice: "0" });
            expect(result[3]).toEqual({ recordingDate: "2004-10-21", saleDate: "2004-09-24", transactionType: "HELOCS", buyerName: "BRUCE BANNER", sellerName: null, salePrice: null });
            expect(result[4]).toEqual({ recordingDate: "2004-06-14", saleDate: "2004-06-09", transactionType: "Non-Arms Length", buyerName: "BRUCE BANNER", sellerName: "CAROL BANNER", salePrice: "0" });
        });

        it("in correct order | swaps [0] with [1]", () => {
            // Simultaneous close: ROGERS LLC bought from THOR ODINSON, then immediately sold to STARK LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API returned ROGERS LLC (wholesaler) first — wrong chain order.
            // Chain detection: STARK LLC's seller === ROGERS LLC's buyer → ROGERS LLC is older.
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-02",
                    transactionType: "Arms Length",
                    buyerName: "STARK LLC",
                    sellerName: "BRUCE BANNER",
                    salePrice: "1340000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-01",
                    transactionType: "Arms Length",
                    buyerName: "ROGERS LLC",
                    sellerName: "STARK LLC",
                    salePrice: "1350000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-08",
                    transactionType: "Non-Arms Length",
                    buyerName: "BANNER FAMILY TRUST",
                    sellerName: "PEPPER POTTS",
                    salePrice: "0",
                },
                {
                    recordingDate: "2004-10-21",
                    saleDate: "2004-09-24",
                    transactionType: "HELOCS",
                    buyerName: "BRUCE BANNER",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2004-06-14",
                    saleDate: "2004-06-09",
                    transactionType: "Non-Arms Length",
                    buyerName: "BRUCE BANNER",
                    sellerName: "CAROL BANNER",
                    salePrice: "0",
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult("Sorted Result (ROGERS LLC is buyer on Tx 1 | ROGERS LLC is seller on Tx 2)", result);
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf("ROGERS LLC");
            const starkIdx = buyers.indexOf("STARK LLC");
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-01", transactionType: "Arms Length", buyerName: "ROGERS LLC", sellerName: "STARK LLC", salePrice: "1350000" });
            expect(result[1]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-02", transactionType: "Arms Length", buyerName: "STARK LLC", sellerName: "BRUCE BANNER", salePrice: "1340000" });
            expect(result[2]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-08", transactionType: "Non-Arms Length", buyerName: "BANNER FAMILY TRUST", sellerName: "PEPPER POTTS", salePrice: "0" });
            expect(result[3]).toEqual({ recordingDate: "2004-10-21", saleDate: "2004-09-24", transactionType: "HELOCS", buyerName: "BRUCE BANNER", sellerName: null, salePrice: null });
            expect(result[4]).toEqual({ recordingDate: "2004-06-14", saleDate: "2004-06-09", transactionType: "Non-Arms Length", buyerName: "BRUCE BANNER", sellerName: "CAROL BANNER", salePrice: "0" });
        });

        it("correct order | different sale dates in correct order", () => {
            // Simultaneous close: ROGERS LLC bought from THOR ODINSON, then immediately sold to STARK LLC.
            // Both Arms Length transactions share recording_date 2026-04-15.
            // The SFR API happened to return STARK LLC (end buyer) first — already correct chain order.
            // Chain detection: STARK LLC's seller === ROGERS LLC's buyer → ROGERS LLC is older.
            const txs = [
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-01",
                    transactionType: "Arms Length",
                    buyerName: "ROGERS LLC",
                    sellerName: "STARK LLC",
                    salePrice: "1350000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-02",
                    transactionType: "Arms Length",
                    buyerName: "STARK LLC",
                    sellerName: "BRUCE BANNER",
                    salePrice: "1340000",
                },
                {
                    recordingDate: "2026-04-15",
                    saleDate: "2026-04-08",
                    transactionType: "Non-Arms Length",
                    buyerName: "BANNER FAMILY TRUST",
                    sellerName: "PEPPER POTTS",
                    salePrice: "0",
                },
                {
                    recordingDate: "2004-10-21",
                    saleDate: "2004-09-24",
                    transactionType: "HELOCS",
                    buyerName: "BRUCE BANNER",
                    sellerName: null,
                    salePrice: null,
                },
                {
                    recordingDate: "2004-06-14",
                    saleDate: "2004-06-09",
                    transactionType: "Non-Arms Length",
                    buyerName: "BRUCE BANNER",
                    sellerName: "CAROL BANNER",
                    salePrice: "0",
                },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult("Sorted Result (ROGERS LLC is buyer on Tx 2 | ROGERS LLC is seller on Tx 1)", result);
            const buyers = result.map((t) => t.buyerName);

            // Core assertion: ROGERS LLC (end buyer) must appear before STARK LLC (wholesaler)
            const rogersIdx = buyers.indexOf("ROGERS LLC");
            const starkIdx = buyers.indexOf("STARK LLC");
            expect(rogersIdx).toBeLessThan(starkIdx);

            // Full expected order
            expect(result[0]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-01", transactionType: "Arms Length", buyerName: "ROGERS LLC", sellerName: "STARK LLC", salePrice: "1350000" });
            expect(result[1]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-02", transactionType: "Arms Length", buyerName: "STARK LLC", sellerName: "BRUCE BANNER", salePrice: "1340000" });
            expect(result[2]).toEqual({ recordingDate: "2026-04-15", saleDate: "2026-04-08", transactionType: "Non-Arms Length", buyerName: "BANNER FAMILY TRUST", sellerName: "PEPPER POTTS", salePrice: "0" });
            expect(result[3]).toEqual({ recordingDate: "2004-10-21", saleDate: "2004-09-24", transactionType: "HELOCS", buyerName: "BRUCE BANNER", sellerName: null, salePrice: null });
            expect(result[4]).toEqual({ recordingDate: "2004-06-14", saleDate: "2004-06-09", transactionType: "Non-Arms Length", buyerName: "BRUCE BANNER", sellerName: "CAROL BANNER", salePrice: "0" });
        });

        it("Arms Length sale comes before prior Non-Arms Length transfer on same recording date", () => {
            // FURY NICHOLAS E transferred to ROMANOFF NATASHA K (Non-Arms Length, $0) on 2026-02-10,
            // then ROMANOFF NATASHA K immediately sold to PARKER HOLDINGS LTD (Arms Length) on the same
            // recording date. SFR returned the Non-Arms Length transfer first — chain detection fires
            // (PARKER's seller === ROMANOFF's buyer) and Arms Length priority both agree: PARKER comes first.
            const txs = [
                { recordingDate: "2026-02-26", saleDate: "2026-02-20", transactionType: "Arms Length",                    buyerName: "DANVERS CAROL M",    sellerName: "PARKER HOLDINGS LTD",  salePrice: "600000" },
                { recordingDate: "2026-02-10", saleDate: "2026-02-09", transactionType: "Non-Arms Length",                buyerName: "ROMANOFF NATASHA K", sellerName: "FURY NICHOLAS E",      salePrice: "0"      },
                { recordingDate: "2026-02-10", saleDate: "2026-02-10", transactionType: "Arms Length",                    buyerName: "PARKER HOLDINGS LTD", sellerName: "ROMANOFF NATASHA K", salePrice: "502500" },
                { recordingDate: "2025-10-28", saleDate: "2025-10-27", transactionType: "Non-Arms Length",                buyerName: "FOSTER JANE S",      sellerName: "FURY MARIA PATRICIA",  salePrice: "0"      },
                { recordingDate: "2021-08-18", saleDate: "2021-08-13", transactionType: "Non-Arms Length",                buyerName: "FURY MARIA P",       sellerName: "FURY MARIA P",         salePrice: "0"      },
                { recordingDate: "2018-09-13", saleDate: "2018-08-15", transactionType: "Non-Arms Length",                buyerName: "FURY NICHOLAS E E",  sellerName: "FURY NICHOLAS ERROLL", salePrice: "0"      },
                { recordingDate: "2016-09-30", saleDate: null,         transactionType: null,                             buyerName: "FURY N E",           sellerName: null,                   salePrice: null     },
                { recordingDate: "2012-08-30", saleDate: "2012-08-21", transactionType: "REFI LOANS and 2ND TRUST DEEDS", buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     },
                { recordingDate: "2003-04-21", saleDate: "2003-04-14", transactionType: "REFI LOANS and 2ND TRUST DEEDS", buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     },
                { recordingDate: "2002-09-13", saleDate: null,         transactionType: "HELOCS",                         buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     },
                { recordingDate: "1998-02-04", saleDate: null,         transactionType: "HELOCS",                         buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     },
            ];

            const result = sortTransactionsDesc(txs);
            logSortResult("Arms Length sale before Non-Arms Length transfer (same recording date)", result);

            // Core assertion: PARKER HOLDINGS LTD (end buyer, Arms Length) before ROMANOFF NATASHA K (Non-Arms Length transfer)
            const parkerIdx = result.findIndex((t) => t.buyerName === "PARKER HOLDINGS LTD");
            const romanoffIdx = result.findIndex((t) => t.buyerName === "ROMANOFF NATASHA K");
            expect(parkerIdx).toBeLessThan(romanoffIdx);

            // Full expected order
            expect(result[0]).toEqual({ recordingDate: "2026-02-26", saleDate: "2026-02-20", transactionType: "Arms Length",                    buyerName: "DANVERS CAROL M",    sellerName: "PARKER HOLDINGS LTD",  salePrice: "600000" });
            expect(result[1]).toEqual({ recordingDate: "2026-02-10", saleDate: "2026-02-10", transactionType: "Arms Length",                    buyerName: "PARKER HOLDINGS LTD", sellerName: "ROMANOFF NATASHA K", salePrice: "502500" });
            expect(result[2]).toEqual({ recordingDate: "2026-02-10", saleDate: "2026-02-09", transactionType: "Non-Arms Length",                buyerName: "ROMANOFF NATASHA K", sellerName: "FURY NICHOLAS E",      salePrice: "0"      });
            expect(result[3]).toEqual({ recordingDate: "2025-10-28", saleDate: "2025-10-27", transactionType: "Non-Arms Length",                buyerName: "FOSTER JANE S",      sellerName: "FURY MARIA PATRICIA",  salePrice: "0"      });
            expect(result[4]).toEqual({ recordingDate: "2021-08-18", saleDate: "2021-08-13", transactionType: "Non-Arms Length",                buyerName: "FURY MARIA P",       sellerName: "FURY MARIA P",         salePrice: "0"      });
            expect(result[5]).toEqual({ recordingDate: "2018-09-13", saleDate: "2018-08-15", transactionType: "Non-Arms Length",                buyerName: "FURY NICHOLAS E E",  sellerName: "FURY NICHOLAS ERROLL", salePrice: "0"      });
            expect(result[6]).toEqual({ recordingDate: "2016-09-30", saleDate: null,         transactionType: null,                             buyerName: "FURY N E",           sellerName: null,                   salePrice: null     });
            expect(result[7]).toEqual({ recordingDate: "2012-08-30", saleDate: "2012-08-21", transactionType: "REFI LOANS and 2ND TRUST DEEDS", buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     });
            expect(result[8]).toEqual({ recordingDate: "2003-04-21", saleDate: "2003-04-14", transactionType: "REFI LOANS and 2ND TRUST DEEDS", buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     });
            expect(result[9]).toEqual({ recordingDate: "2002-09-13", saleDate: null,         transactionType: "HELOCS",                         buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     });
            expect(result[10]).toEqual({ recordingDate: "1998-02-04", saleDate: null,        transactionType: "HELOCS",                         buyerName: "FURY NICHOLAS E",   sellerName: null,                   salePrice: null     });
        });

        it("preserves original order when same recording_date, same type, and no chain relationship", () => {
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
            logSortResult("No chain relationship — original order preserved", result);
            // No chain relationship, same type, same recording_date → original order preserved
            expect(result[0].buyerName).toBe("BUYER A");
            expect(result[1].buyerName).toBe("BUYER B");
        });
    });
});
