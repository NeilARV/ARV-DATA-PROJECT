import { db } from 'server/storage';
import {
    properties,
    addresses,
    structures,
    lastSales,
    propertyTransactions,
} from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { eq, sql, and, or, inArray } from 'drizzle-orm';
import { resolveDateRange } from 'server/utils/resolveDateRange';

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
 * Two-phase approach:
 *   Phase 1 — resolve qualifying property IDs with all filters applied on a lean
 *              properties + addresses join (no status/transaction aggregation).
 *   Phase 2 — fetch full pin data for only those IDs; statusData is scoped via
 *              inArray so it never scans the full property_statuses table.
 *
 * Buyer/seller IDs and owner name are derived from property_transactions:
 *  - companyId provided → only properties where that company appears as buyer or seller
 *    in any Arms Length or Assignment tx; buyerId/sellerId reflect that company's role.
 *  - No companyId → buyerId/sellerId columns returned as null (not needed for pin color).
 */
export async function getMapProperties(
    county?: string,
    statusFilter?: string | string[],
    dateRange?: string,
    companyId?: string,
): Promise<MapPropertyData[]> {
    const companyIdTrimmed = companyId?.trim() ?? '';
    const hasCompanyFilter = companyIdTrimmed !== '';
    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;

    // ── Phase 1: Resolve qualifying property IDs ──────────────────────────────
    // All filters are evaluated here on a lean ID-only query so that the
    // statusData aggregation in Phase 2 never touches more rows than needed.
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
        idConditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
            )`,
        );
    }

    const idWhereClause = idConditions.length > 0 ? and(...idConditions) : undefined;

    const baseIdQuery = db
        .select({ id: properties.id })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId));

    const idRows: Array<{ id: string }> = await (
        idWhereClause ? (baseIdQuery as any).where(idWhereClause) : baseIdQuery
    ).execute();

    const qualifyingIds = idRows.map((r) => r.id);

    if (qualifyingIds.length === 0) return [];

    // ── Phase 2: Fetch full pin data for qualifying IDs only ──────────────────
    // statusData is scoped to qualifyingIds — avoids a full property_statuses scan.
    const statusData = db
        .select({
            propertyId: propertyStatuses.propertyId,
            primaryStatus: sql<
                string | null
            >`(array_agg(${statuses.name} ORDER BY CASE ${statuses.name}
                WHEN 'wholesale' THEN 0 WHEN 'on-market' THEN 1
                WHEN 'in-renovation' THEN 2 WHEN 'sold' THEN 3 ELSE 4
            END))[1]`.as('primary_status'),
            allStatuses: sql<string[]>`COALESCE(array_agg(${statuses.name}), ARRAY[]::text[])`.as(
                'all_statuses',
            ),
        })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(inArray(propertyStatuses.propertyId, qualifyingIds))
        .groupBy(propertyStatuses.propertyId)
        .as('status_data');

    const rawResults = await db
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
        .leftJoin(statusData, eq(properties.id, statusData.propertyId))
        .where(inArray(properties.id, qualifyingIds))
        .execute();

    return rawResults
        .filter((prop: any) => {
            const lat = prop.latitude
                ? typeof prop.latitude === 'string'
                    ? parseFloat(prop.latitude)
                    : Number(prop.latitude)
                : null;
            const lon = prop.longitude
                ? typeof prop.longitude === 'string'
                    ? parseFloat(prop.longitude)
                    : Number(prop.longitude)
                : null;
            return lat != null && lon != null && !isNaN(lat) && !isNaN(lon);
        })
        .map((prop: any) => {
            const lat = prop.latitude
                ? typeof prop.latitude === 'string'
                    ? parseFloat(prop.latitude)
                    : Number(prop.latitude)
                : null;
            const lon = prop.longitude
                ? typeof prop.longitude === 'string'
                    ? parseFloat(prop.longitude)
                    : Number(prop.longitude)
                : null;
            const baths = prop.bathrooms
                ? typeof prop.bathrooms === 'string'
                    ? parseFloat(prop.bathrooms)
                    : Number(prop.bathrooms)
                : null;
            const price = prop.price
                ? typeof prop.price === 'string'
                    ? parseFloat(prop.price)
                    : Number(prop.price)
                : 0;
            const buyerId = prop.txBuyerId ? String(prop.txBuyerId) : null;
            const sellerId = prop.txSellerId ? String(prop.txSellerId) : null;
            const companyIdOut = buyerId || sellerId || null;

            return {
                id: String(prop.id),
                latitude: lat,
                longitude: lon,
                address: prop.address || '',
                city: prop.city || '',
                zipcode: prop.zipcode || '',
                county: prop.county || '',
                propertyType: prop.propertyType || '',
                bedrooms: prop.bedrooms ? Number(prop.bedrooms) : null,
                bathrooms: baths,
                price,
                status: prop.status || '',
                statuses: Array.isArray(prop.statuses) ? prop.statuses : [],
                propertyOwner: prop.txBuyerName || null,
                companyId: companyIdOut,
                buyerId,
                sellerId,
            };
        });
}
