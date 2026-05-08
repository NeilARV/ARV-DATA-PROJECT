import { db } from "server/storage";
import { properties, addresses, structures, lastSales, propertyTransactions } from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { eq, sql, and, or } from "drizzle-orm";
import { resolveDateRange } from "server/utils/resolveDateRange";

export interface MapPropertyData {
    id: string;
    latitude: number | null;
    longitude: number | null;
    address: string;
    city: string;
    zipcode: string;
    county: string;
    propertyType: string;
    bedrooms: number | null;
    bathrooms: number | null;
    price: number;
    status: string;
    statuses: string[];
    propertyOwner: string | null;
    companyId: string | null;
    buyerId: string | null;
    sellerId: string | null;
}

/**
 * Fetches minimal property data for map pins.
 *
 * Buyer/seller IDs and owner name are derived from property_transactions (not from
 * properties.buyer_id / properties.seller_id):
 *  - companyId provided → only properties where that company appears as buyer or seller
 *    in any Arms Length or Assignment tx; buyerId/sellerId reflect that company's role.
 *  - No companyId → buyerId/sellerId from most recent Arms Length tx (sort_order ASC).
 */
export async function getMapProperties(
    county?: string,
    statusFilter?: string | string[],
    dateRange?: string,
    companyId?: string,
): Promise<MapPropertyData[]> {
    const conditions = [];

    const companyIdTrimmed = companyId?.trim() ?? "";
    const hasCompanyFilter = companyIdTrimmed !== "";

    // Aggregate all statuses per property once via a subquery join instead of
    // correlated EXISTS subqueries per row.
    const statusData = db
        .select({
            propertyId: propertyStatuses.propertyId,
            primaryStatus: sql<string | null>`(array_agg(${statuses.name} ORDER BY CASE ${statuses.name}
                WHEN 'wholesale' THEN 0 WHEN 'on-market' THEN 1
                WHEN 'in-renovation' THEN 2 WHEN 'sold' THEN 3 ELSE 4
            END))[1]`.as("primary_status"),
            allStatuses: sql<string[]>`COALESCE(array_agg(${statuses.name}), ARRAY[]::text[])`.as("all_statuses"),
        })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .groupBy(propertyStatuses.propertyId)
        .as("status_data");

    // Pre-aggregate max Arms Length recording_date per property once (replaces two
    // correlated MAX subqueries that would execute once per row).
    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;
    const alDates = resolvedRange
        ? db
              .select({
                  propertyId: propertyTransactions.propertyId,
                  maxDate: sql<string | null>`MAX(${propertyTransactions.recordingDate})`.as("max_al_date"),
              })
              .from(propertyTransactions)
              .where(sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`)
              .groupBy(propertyTransactions.propertyId)
              .as("al_dates")
        : null;

    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map(s => s.toString().trim().toLowerCase());
            // Filter on the already-joined statusData column (array overlap) instead of a
            // correlated EXISTS subquery that re-scans property_statuses for every row.
            conditions.push(
                sql`${statusData.allStatuses} && ARRAY[${sql.join(normalizedStatuses.map(s => sql`${s}`), sql`, `)}]::text[]`
            );
        }
    }

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            )
        );
    }

    if (alDates && resolvedRange) {
        conditions.push(sql`${alDates.maxDate} >= ${resolvedRange.dateMin}::date`);
        conditions.push(sql`${alDates.maxDate} <= ${resolvedRange.dateMax}::date`);
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

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query = db
        .select({
            id: properties.id,
            latitude: addresses.latitude,
            longitude: addresses.longitude,
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            zipcode: addresses.zipCode,
            county: sql<string>`COALESCE(${properties.county}, ${addresses.county}, '')`,
            propertyType: properties.propertyType,
            bedrooms: structures.bedsCount,
            bathrooms: structures.baths,
            price: lastSales.price,
            status: statusData.primaryStatus,
            statuses: statusData.allStatuses,
            // Buyer/seller IDs are only needed when a company is selected (for pin color coding).
            // Skip the correlated subqueries entirely when no company filter is active.
            txBuyerId: hasCompanyFilter
                ? sql<string | null>`(
                    SELECT pt.buyer_id::text FROM property_transactions pt
                    WHERE pt.property_id = ${properties.id}
                    AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                    AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
                    ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1
                  )`
                : sql<string | null>`null`,
            txSellerId: hasCompanyFilter
                ? sql<string | null>`(
                    SELECT pt.seller_id::text FROM property_transactions pt
                    WHERE pt.property_id = ${properties.id}
                    AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                    AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
                    ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1
                  )`
                : sql<string | null>`null`,
            txBuyerName: hasCompanyFilter
                ? sql<string | null>`(
                    SELECT pt.buyer_name FROM property_transactions pt
                    WHERE pt.property_id = ${properties.id}
                    AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                    AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
                    ORDER BY COALESCE(pt.sort_order, 999999) ASC LIMIT 1
                  )`
                : sql<string | null>`null`,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(statusData, eq(properties.id, statusData.propertyId));

    if (alDates) {
        query = (query as any).innerJoin(alDates, eq(properties.id, alDates.propertyId));
    }

    const rawResults = await (whereClause ? (query as any).where(whereClause) : query).execute();

    return rawResults
        .filter((prop: any) => {
            const lat = prop.latitude ? (typeof prop.latitude === "string" ? parseFloat(prop.latitude) : Number(prop.latitude)) : null;
            const lon = prop.longitude ? (typeof prop.longitude === "string" ? parseFloat(prop.longitude) : Number(prop.longitude)) : null;
            return lat != null && lon != null && !isNaN(lat) && !isNaN(lon);
        })
        .map((prop: any) => {
            const lat = prop.latitude ? (typeof prop.latitude === "string" ? parseFloat(prop.latitude) : Number(prop.latitude)) : null;
            const lon = prop.longitude ? (typeof prop.longitude === "string" ? parseFloat(prop.longitude) : Number(prop.longitude)) : null;
            const baths = prop.bathrooms ? (typeof prop.bathrooms === "string" ? parseFloat(prop.bathrooms) : Number(prop.bathrooms)) : null;
            const price = prop.price ? (typeof prop.price === "string" ? parseFloat(prop.price) : Number(prop.price)) : 0;
            const buyerId = prop.txBuyerId ? String(prop.txBuyerId) : null;
            const sellerId = prop.txSellerId ? String(prop.txSellerId) : null;
            const companyIdOut = buyerId || sellerId || null;

            return {
                id: String(prop.id),
                latitude: lat,
                longitude: lon,
                address: prop.address || "",
                city: prop.city || "",
                zipcode: prop.zipcode || "",
                county: prop.county || "",
                propertyType: prop.propertyType || "",
                bedrooms: prop.bedrooms ? Number(prop.bedrooms) : null,
                bathrooms: baths,
                price,
                status: prop.status || "",
                statuses: Array.isArray(prop.statuses) ? prop.statuses : [],
                propertyOwner: prop.txBuyerName || null,
                companyId: companyIdOut,
                buyerId,
                sellerId,
            };
        });
}
