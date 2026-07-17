import { sql, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { propertyTransactions } from '@database/schemas/properties.schema';

// The directory "Sort by" options, shared by the company directory (getContacts) and the
// public groups directory (getGroupDirectory). `new-buyers` has no per-sort count query — it
// orders by creation date instead — so buildSortCountSpec returns null for it.
export const DIRECTORY_SORT_OPTIONS = [
    'most-properties',
    'most-sold-properties',
    'most-sold-properties-all-time',
    'most-bought-properties',
    'most-bought-properties-all-time',
    'new-buyers',
    'buys-wholesale',
    'wholesalers',
] as const;
export type DirectorySortOption = (typeof DIRECTORY_SORT_OPTIONS)[number];

// The seven sorts that carry a per-transaction count (everything but new-buyers), each mapped to
// the CompanyContactWithCounts / GroupDirectoryRow field it populates.
export type CountedSortOption = Exclude<DirectorySortOption, 'new-buyers'>;
export const SORT_COUNT_FIELD: Record<CountedSortOption, string> = {
    'most-properties': 'propertyCount',
    'most-sold-properties': 'propertiesSoldCount',
    'most-sold-properties-all-time': 'propertiesSoldCountAllTime',
    'most-bought-properties': 'propertiesBoughtCount',
    'most-bought-properties-all-time': 'propertiesBoughtCountAllTime',
    'buys-wholesale': 'wholesaleBuyCount',
    wholesalers: 'wholesalerCount',
};

/** Which side of the sale identifies the company, whether the count de-duplicates on distinct
 * property, and the sort-specific predicate parts (county + id filters are added by the caller). */
export type SortCountSpec = {
    roleColumn: PgColumn;
    distinct: boolean;
    whereParts: SQL[];
};

/**
 * The building blocks of a single directory sort's count query. Both the per-company directory
 * (grouped by the buyer/seller id) and the groups directory (grouped by the company's group id)
 * build their count query from this, so the two surfaces can never disagree on what a sort counts.
 * @returns null for `new-buyers` (no count query — ordered by creation date instead).
 */
export function buildSortCountSpec(
    sort: DirectorySortOption,
    dates: { ytdStartStr: string; todayStr: string },
): SortCountSpec | null {
    const armsLength = sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`;
    const ytdWindow = [
        gte(propertyTransactions.recordingDate, dates.ytdStartStr),
        lte(propertyTransactions.recordingDate, dates.todayStr),
    ];
    switch (sort) {
        case 'most-properties':
            // Current owner: the buyer on the most-recent (sort_order=1) transaction.
            return {
                roleColumn: propertyTransactions.buyerId,
                distinct: true,
                whereParts: [
                    sql`${propertyTransactions.sortOrder} = 1`,
                    sql`${propertyTransactions.buyerId} IS NOT NULL`,
                ],
            };
        case 'most-sold-properties':
            return {
                roleColumn: propertyTransactions.sellerId,
                distinct: false,
                whereParts: [armsLength, ...ytdWindow],
            };
        case 'most-sold-properties-all-time':
            return {
                roleColumn: propertyTransactions.sellerId,
                distinct: false,
                whereParts: [armsLength],
            };
        case 'most-bought-properties':
            return {
                roleColumn: propertyTransactions.buyerId,
                distinct: false,
                whereParts: [armsLength, ...ytdWindow],
            };
        case 'most-bought-properties-all-time':
            return {
                roleColumn: propertyTransactions.buyerId,
                distinct: false,
                whereParts: [armsLength],
            };
        case 'buys-wholesale':
            // End buyer on a wholesale property: buyer on the sort_order=1 (final) purchase — the
            // company that bought FROM the wholesaler, not an intermediate or assignment leg.
            return {
                roleColumn: propertyTransactions.buyerId,
                distinct: true,
                whereParts: [
                    sql`${propertyTransactions.sortOrder} = 1`,
                    sql`${propertyTransactions.buyerId} IS NOT NULL`,
                    sql`EXISTS (
                        SELECT 1 FROM property_statuses ps
                        JOIN statuses s ON s.id = ps.status_id
                        WHERE ps.property_id = ${propertyTransactions.propertyId}
                        AND s.name = 'wholesale'
                    )`,
                ],
            };
        case 'wholesalers':
            // Wholesaler: seller on the sort_order=1 (final) transaction for a wholesale property.
            return {
                roleColumn: propertyTransactions.sellerId,
                distinct: true,
                whereParts: [
                    sql`${propertyTransactions.sortOrder} = 1`,
                    sql`${propertyTransactions.sellerId} IS NOT NULL`,
                    sql`EXISTS (
                        SELECT 1 FROM property_statuses ps
                        JOIN statuses s ON s.id = ps.status_id
                        WHERE ps.property_id = ${propertyTransactions.propertyId}
                        AND s.id = 4
                    )`,
                ],
            };
        default:
            return null;
    }
}
