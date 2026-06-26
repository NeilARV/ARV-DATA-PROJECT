import { db } from 'server/storage';
import {
    properties,
    addresses,
    structures,
    lastSales,
} from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { eq, sql, and, or, inArray, type SQL } from 'drizzle-orm';
import { resolveDateRange } from 'server/utils/resolveDateRange';
import { isPrefixMatchCity } from '@shared/constants/cityMatch';

interface MapPropertyData {
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

/** Geographic bounding box (Leaflet bounds: south/west = SW corner, north/east = NE corner). */
export interface MapBounds {
    south: number;
    west: number;
    north: number;
    east: number;
}

/** Bounding box + count of the qualifying set — used to center/zoom the map without loading every pin. */
export interface MapExtent {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    count: number;
}

/** Per-county property count (county lower-cased + trimmed) for the national overview layer. */
export interface RegionCount {
    county: string;
    count: number;
}

/** Shared filters that resolve which properties qualify (county/status/date/company/location). */
interface MapFilters {
    county?: string;
    statusFilter?: string | string[];
    dateRange?: string;
    companyId?: string;
    companyRole?: string;
    /** Exact zip-code match (addresses.zip_code). */
    zipcode?: string;
    /** City filter; PREFIX_MATCH_CITIES match by prefix (mirrors the client's cityMatchesFilter). */
    city?: string;
}

interface MapPropertiesParams extends MapFilters {
    /** Optional viewport bounds — when present, only pins inside the box are returned. */
    bounds?: MapBounds;
}

type TxInfo = { buyerId: string | null; sellerId: string | null; buyerName: string | null };

/**
 * Builds the WHERE conditions that resolve qualifying property IDs, shared by the pin and
 * extent queries. Filters are evaluated on a lean properties + addresses join; status, date,
 * and company predicates are EXISTS subqueries so they never aggregate child tables here.
 * @param filters county/status/date/company filters
 * @param bounds optional viewport box that further restricts to pins inside it
 * @returns the condition list plus resolved company-filter metadata
 */
function buildMapIdConditions(
    filters: MapFilters,
    bounds?: MapBounds,
): { conditions: SQL[]; hasCompanyFilter: boolean; companyIdTrimmed: string } {
    const { county, statusFilter, dateRange, companyId, companyRole, zipcode, city } = filters;
    const companyIdTrimmed = companyId?.trim() ?? '';
    const hasCompanyFilter = companyIdTrimmed !== '';
    const resolvedRange = dateRange ? (resolveDateRange(dateRange) ?? null) : null;

    const conditions: SQL[] = [];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        const countyCondition = or(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
            sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
        );
        if (countyCondition) conditions.push(countyCondition);
    }

    if (zipcode && zipcode.trim() !== '') {
        conditions.push(sql`${addresses.zipCode} = ${zipcode.trim()}`);
    }

    if (city && city.trim() !== '') {
        const normalizedCity = city.trim().toLowerCase();
        // Prefix-match metros (PREFIX_MATCH_CITIES) span many city-name variants — match by prefix,
        // like the client's cityMatchesFilter; everything else is an exact match.
        if (isPrefixMatchCity(normalizedCity)) {
            conditions.push(sql`LOWER(${addresses.city}) LIKE ${`${normalizedCity}%`}`);
        } else {
            conditions.push(sql`LOWER(TRIM(${addresses.city})) = ${normalizedCity}`);
        }
    }

    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map((s) => s.trim().toLowerCase());
            conditions.push(
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
        conditions.push(
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
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
                AND ${roleCondition}
            )`,
        );
    }

    // Viewport box — keep last so the cheap, sargable lat/lng range narrows the set early.
    if (bounds) {
        conditions.push(
            sql`${addresses.latitude} BETWEEN ${bounds.south} AND ${bounds.north}`,
            sql`${addresses.longitude} BETWEEN ${bounds.west} AND ${bounds.east}`,
        );
    }

    return { conditions, hasCompanyFilter, companyIdTrimmed };
}

/** Parses a Drizzle decimal/text coordinate into a finite number, or null. */
function toCoord(value: string | number | null): number | null {
    if (value == null) return null;
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) ? n : null;
}

/**
 * Fetches minimal property data for map pins, restricted to the viewport when `bounds` is given.
 *
 * Two-phase approach:
 *   Phase 1 — resolve qualifying property IDs with all filters (+ viewport box) applied on a lean
 *              properties + addresses join.
 *   Phase 2 — fetch full pin data for only those IDs; statusData is scoped via inArray so it never
 *              scans the full property_statuses table.
 *
 * Buyer/seller IDs and owner name are derived from property_transactions (one correlated subquery
 * per pin, returned as a single JSON object) only when a company filter is active — otherwise those
 * columns are null (not needed for pin color).
 *
 * @param params county/status/date/company filters plus an optional viewport `bounds`
 * @returns one entry per pin with valid coordinates
 */
export async function getMapProperties(params: MapPropertiesParams): Promise<MapPropertyData[]> {
    const { bounds, ...filters } = params;
    const { conditions, hasCompanyFilter, companyIdTrimmed } = buildMapIdConditions(filters, bounds);

    const idWhereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseIdQuery = db
        .select({ id: properties.id })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId));

    const idRows = await (idWhereClause ? baseIdQuery.where(idWhereClause) : baseIdQuery).execute();
    const qualifyingIds = idRows.map((r) => r.id);

    if (qualifyingIds.length === 0) return [];

    // ── Phase 2: Fetch full pin data for qualifying IDs only ──────────────────
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

    // One correlated subquery per pin (only when a company is selected): a single JSON object with
    // the company's buyer/seller role + name on its most relevant Arms Length / Assignment tx.
    const txInfoSql = hasCompanyFilter
        ? sql<TxInfo | null>`(
            SELECT json_build_object(
                'buyerId', pt.buyer_id::text,
                'sellerId', pt.seller_id::text,
                'buyerName', pt.buyer_name
            )
            FROM property_transactions pt
            WHERE pt.property_id = ${properties.id}
            AND LOWER(TRIM(pt.transaction_type)) IN ('arms length', 'assignment')
            AND (pt.buyer_id = ${companyIdTrimmed}::uuid OR pt.seller_id = ${companyIdTrimmed}::uuid)
            ORDER BY COALESCE(pt.sort_order, 999999) ASC
            LIMIT 1
          )`
        : sql<TxInfo | null>`null`;

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
            txInfo: txInfoSql,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(statusData, eq(properties.id, statusData.propertyId))
        .where(inArray(properties.id, qualifyingIds))
        .execute();

    return rawResults
        .map((prop) => {
            const latitude = toCoord(prop.latitude);
            const longitude = toCoord(prop.longitude);
            if (latitude == null || longitude == null) return null;

            const tx = prop.txInfo;
            const buyerId = tx?.buyerId ? String(tx.buyerId) : null;
            const sellerId = tx?.sellerId ? String(tx.sellerId) : null;

            const pin: MapPropertyData = {
                id: String(prop.id),
                latitude,
                longitude,
                address: prop.address ?? '',
                city: prop.city ?? '',
                zipcode: prop.zipcode ?? '',
                county: prop.county ?? '',
                propertyType: prop.propertyType ?? '',
                bedrooms: prop.bedrooms == null ? null : Number(prop.bedrooms),
                bathrooms: toCoord(prop.bathrooms),
                price: toCoord(prop.price) ?? 0,
                status: prop.status ?? '',
                statuses: Array.isArray(prop.statuses) ? prop.statuses : [],
                propertyOwner: tx?.buyerName ?? null,
                companyId: buyerId || sellerId || null,
                buyerId,
                sellerId,
            };
            return pin;
        })
        .filter((pin): pin is MapPropertyData => pin !== null);
}

/**
 * Computes the bounding box + count of the qualifying property set (no viewport restriction).
 * Used to center/zoom the map when filters or the selected company change, without loading every
 * pin — a single cheap aggregate over the same filters the pin query uses.
 *
 * @param filters county/status/date/company filters
 * @returns the extent of pins with coordinates, or null when none qualify
 */
export async function getMapExtent(filters: MapFilters): Promise<MapExtent | null> {
    const { conditions } = buildMapIdConditions(filters);
    conditions.push(sql`${addresses.latitude} IS NOT NULL`, sql`${addresses.longitude} IS NOT NULL`);

    const [row] = await db
        .select({
            minLat: sql<string | null>`MIN(${addresses.latitude})`,
            maxLat: sql<string | null>`MAX(${addresses.latitude})`,
            minLng: sql<string | null>`MIN(${addresses.longitude})`,
            maxLng: sql<string | null>`MAX(${addresses.longitude})`,
            count: sql<number>`COUNT(*)::int`,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(and(...conditions))
        .execute();

    const minLat = toCoord(row?.minLat ?? null);
    const maxLat = toCoord(row?.maxLat ?? null);
    const minLng = toCoord(row?.minLng ?? null);
    const maxLng = toCoord(row?.maxLng ?? null);

    if (minLat == null || maxLat == null || minLng == null || maxLng == null) return null;

    return { minLat, maxLat, minLng, maxLng, count: Number(row?.count ?? 0) };
}

/**
 * Property counts grouped by county for the national overview layer. Deliberately cross-region:
 * it ignores county/company/location filters (so every region shows) but respects status + date so
 * the overview stays consistent with the zoomed-in view. Cheap aggregate — no pin data is returned.
 *
 * @param filters status + date filters only (county/company/location are intentionally ignored)
 * @returns one row per county (lower-cased, trimmed) that has properties with coordinates
 */
export async function getRegionCounts(
    filters: Pick<MapFilters, 'statusFilter' | 'dateRange'>,
): Promise<RegionCount[]> {
    const { conditions } = buildMapIdConditions({
        statusFilter: filters.statusFilter,
        dateRange: filters.dateRange,
    });
    conditions.push(sql`${addresses.latitude} IS NOT NULL`, sql`${addresses.longitude} IS NOT NULL`);

    const countyExpr = sql<string>`LOWER(TRIM(COALESCE(${properties.county}, ${addresses.county})))`;

    const rows = await db
        .select({ county: countyExpr, count: sql<number>`COUNT(*)::int` })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(and(...conditions))
        .groupBy(countyExpr)
        .execute();

    return rows
        .filter((r) => r.county != null && r.county !== '')
        .map((r) => ({ county: r.county, count: Number(r.count) }));
}
