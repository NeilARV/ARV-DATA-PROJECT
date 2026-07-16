import { db } from 'server/storage';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { eq, sql, and, inArray } from 'drizzle-orm';
import { resolveDateRange } from 'server/utils/resolveDateRange';
import { companyInvolvementExists } from 'server/utils/companyTransactionFilters';
import { countyScopeCondition } from 'server/utils/countyFilter';
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
interface GetZipCountsFilters {
    county?: string | string[];
    /** Restricts county matching to this MSA's tracked counties (see countyScopeCondition). */
    msa?: string;
    statusFilter?: string | string[];
    dateRange?: string;
    companyId?: string;
    companyRole?: string;
}

export async function getZipCounts({
    county,
    msa,
    statusFilter,
    dateRange,
    companyId,
    companyRole,
}: GetZipCountsFilters): Promise<ZipCount[]> {
    const companyIdTrimmed = companyId?.trim() ?? '';
    const hasCompanyFilter = companyIdTrimmed !== '';
    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;

    // ── Phase 1: Resolve qualifying property IDs ──────────────────────────────
    const idConditions = [];

    const countyCondition = countyScopeCondition({ county, msa });
    if (countyCondition) idConditions.push(countyCondition);

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
        idConditions.push(companyInvolvementExists(companyIdTrimmed, companyRole));
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
