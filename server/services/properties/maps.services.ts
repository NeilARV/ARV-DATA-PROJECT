import { db } from "server/storage";
import { properties, addresses, structures, lastSales } from "@database/schemas/properties.schema";
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

    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map(s => s.toString().trim().toLowerCase());
            conditions.push(
                sql`EXISTS (
                    SELECT 1 FROM property_statuses ps
                    JOIN statuses s ON s.id = ps.status_id
                    WHERE ps.property_id = ${properties.id}
                    AND LOWER(s.name) = ANY(ARRAY[${sql.join(normalizedStatuses.map(s => sql`${s}`), sql`, `)}])
                )`
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

    if (dateRange) {
        const range = resolveDateRange(dateRange);
        if (range) {
            conditions.push(
                sql`(
                    SELECT MAX(pt.recording_date)
                    FROM property_transactions pt
                    WHERE pt.property_id = ${properties.id}
                    AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
                ) >= ${range.dateMin}::date`
            );
            conditions.push(
                sql`(
                    SELECT MAX(pt.recording_date)
                    FROM property_transactions pt
                    WHERE pt.property_id = ${properties.id}
                    AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
                ) <= ${range.dateMax}::date`
            );
        }
    }

    const companyIdTrimmed = companyId?.trim() ?? "";
    const hasCompanyFilter = companyIdTrimmed !== "";

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

    const query = db
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
            status: sql<string | null>`(
                SELECT s.name FROM property_statuses ps
                JOIN statuses s ON s.id = ps.status_id
                WHERE ps.property_id = ${properties.id}
                ORDER BY CASE s.name
                    WHEN 'wholesale' THEN 0 WHEN 'on-market' THEN 1
                    WHEN 'in-renovation' THEN 2 WHEN 'sold' THEN 3 ELSE 4
                END LIMIT 1
            )`,
            statuses: sql<string[]>`COALESCE(
                (SELECT array_agg(s.name) FROM property_statuses ps
                 JOIN statuses s ON s.id = ps.status_id
                 WHERE ps.property_id = ${properties.id}),
                ARRAY[]::text[]
            )`,
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
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId));

    const rawResults = await (whereClause ? query.where(whereClause) : query).execute();

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
