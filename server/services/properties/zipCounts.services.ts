import { db } from 'server/storage';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { eq, sql, and, or, inArray } from 'drizzle-orm';
import { resolveDateRange } from 'server/utils/resolveDateRange';
import type { ZipCount } from '@shared/types/properties';

/**
 * Returns property counts grouped by zip code for the given filters.
 *
 * Two-phase approach (mirrors maps.services.ts):
 *   Phase 1 — resolve qualifying property IDs with a lean filter query so that
 *              correlated EXISTS subqueries only run against the county-filtered set.
 *   Phase 2 — aggregate zip counts from addresses using inArray on qualifying IDs;
 *              avoids per-row EXISTS scans across the full properties table.
 */
export async function getZipCounts(
    county?: string,
    statusFilter?: string | string[],
    dateRange?: string,
    companyId?: string,
    companyRole?: string,
): Promise<ZipCount[]> {
    const companyIdTrimmed = companyId?.trim() ?? '';
    const hasCompanyFilter = companyIdTrimmed !== '';
    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;

    // ── Phase 1: Resolve qualifying property IDs ──────────────────────────────
    const idConditions = [];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        idConditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
            ),
        );
    }

    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map((s) => s.trim().toLowerCase());
            idConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM property_statuses ps
                    JOIN statuses s ON s.id = ps.status_id
                    WHERE ps.property_id = ${properties.id}
                    AND LOWER(s.name) = ANY(ARRAY[${sql.join(
                        normalizedStatuses.map((s) => sql`${s}`),
                        sql`, `,
                    )}]::text[])
                )`,
            );
        }
    }

    if (resolvedRange) {
        idConditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
                AND pt.recording_date >= ${resolvedRange.dateMin}::date
                AND pt.recording_date <= ${resolvedRange.dateMax}::date
            )`,
        );
    }

    if (hasCompanyFilter) {
        const roleCondition =
            companyRole === 'buyer'
                ? sql`pt.buyer_id = ${companyIdTrimmed}::uuid`
                : companyRole === 'seller'
                  ? sql`pt.seller_id = ${companyIdTrimmed}::uuid`
                  : sql`(pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)`;
        idConditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                AND ${roleCondition}
            )`,
        );
    }

    const idWhereClause = idConditions.length > 0 ? and(...idConditions) : undefined;

    const baseIdQuery = db
        .select({ id: properties.id })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .$dynamic();

    const idRows: { id: string }[] = await (
        idWhereClause ? baseIdQuery.where(idWhereClause) : baseIdQuery
    ).execute();

    const qualifyingIds = idRows.map((r) => r.id);

    if (qualifyingIds.length === 0) return [];

    // ── Phase 2: Aggregate zip counts for qualifying IDs only ─────────────────
    // Single GROUP BY on addresses scoped to qualifying IDs — no correlated subqueries.
    const results = await db
        .select({
            zipCode: addresses.zipCode,
            count: sql<number>`COUNT(*)`,
        })
        .from(addresses)
        .where(inArray(addresses.propertyId, qualifyingIds))
        .groupBy(addresses.zipCode)
        .execute();

    return results
        .filter((r): r is { zipCode: string; count: number } => {
            return r.zipCode != null && r.zipCode.trim() !== '';
        })
        .map((r) => ({
            zipCode: r.zipCode.trim(),
            count: Number(r.count),
        }));
}
