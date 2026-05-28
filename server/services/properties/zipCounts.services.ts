import { db } from "server/storage";
import { properties, addresses, propertyTransactions } from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { eq, sql, and, or } from "drizzle-orm";
import { resolveDateRange } from "server/utils/resolveDateRange";

export interface ZipCount {
    zipCode: string;
    count: number;
}

export async function getZipCounts(
    county?: string,
    statusFilter?: string | string[],
    dateRange?: string,
    companyId?: string,
): Promise<ZipCount[]> {
    const conditions = [];

    const companyIdTrimmed = companyId?.trim() ?? "";
    const hasCompanyFilter = companyIdTrimmed !== "";

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            )
        );
    }

    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map(s => s.trim().toLowerCase());
            conditions.push(
                sql`EXISTS (
                    SELECT 1 FROM property_statuses ps
                    JOIN statuses s ON s.id = ps.status_id
                    WHERE ps.property_id = ${properties.id}
                    AND LOWER(s.name) = ANY(ARRAY[${sql.join(normalizedStatuses.map(s => sql`${s}`), sql`, `)}]::text[])
                )`
            );
        }
    }

    if (hasCompanyFilter) {
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
            )`
        );
    }

    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;
    if (resolvedRange) {
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
                AND pt.recording_date >= ${resolvedRange.dateMin}::date
                AND pt.recording_date <= ${resolvedRange.dateMax}::date
            )`
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const query = db
        .select({
            zipCode: addresses.zipCode,
            count: sql<number>`COUNT(DISTINCT ${properties.id})`,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .groupBy(addresses.zipCode);

    const results = whereClause
        ? await (query as any).where(whereClause).execute()
        : await query.execute();

    return results
        .filter((r: any) => r.zipCode && r.zipCode.trim() !== "")
        .map((r: any) => ({
            zipCode: r.zipCode.trim(),
            count: Number(r.count),
        }));
}
