import { db } from "server/storage";
import { properties, addresses, structures, lastSales } from "../../../database/schemas/properties.schema";
import { companies } from "../../../database/schemas/companies.schema";
import { eq, sql, and, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const buyerCompanies = alias(companies, "buyer_companies");
const sellerCompanies = alias(companies, "seller_companies");

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
    propertyOwner: string | null;
    companyId: string | null; // Primary company for display (buyer or seller)
    buyerId: string | null;
    sellerId: string | null;
}

/**
 * Fetches minimal property data for map pins
 * @param county - Optional county filter
 * @returns Array of property data formatted for map display
 */
export async function getMapProperties(county?: string, statusFilter?: string | string[]): Promise<MapPropertyData[]> {
    const conditions = [];

    // Apply status filter if provided, otherwise show all statuses
    if (statusFilter) {
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
            const normalizedStatuses = statusArray.map(s => s.toString().trim().toLowerCase());
            if (normalizedStatuses.length === 1) {
                conditions.push(
                    sql`LOWER(TRIM(${properties.status})) = ${normalizedStatuses[0]}`
                );
            } else {
                // Use OR for multiple status values
                conditions.push(
                    or(...normalizedStatuses.map(s => 
                        sql`LOWER(TRIM(${properties.status})) = ${s}`
                    )) as any
                );
            }
        }
    }

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        // Filter by county from either properties table or addresses table
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            )
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Select only minimal fields needed for map pins and filtering
    // Join with addresses for location data, structures for bedrooms/bathrooms, 
    // lastSales for price, and companies for property owner (buyer or seller)
    // Only include properties that have addresses (needed for coordinates)
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
            status: properties.status,
            // Company name and ID from buyer or seller (for client-side filtering)
            companyName: sql<string | null>`COALESCE(${buyerCompanies.companyName}, ${sellerCompanies.companyName})`,
            buyerId: properties.buyerId,
            sellerId: properties.sellerId,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId)) // Use inner join to only get properties with addresses
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
        .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id));

    if (whereClause) {
        query = query.where(whereClause) as any;
    }

    const rawResults = await query.execute();

    // Map results to use companyName as propertyOwner for backward compatibility
    // Also ensure we have valid coordinates (latitude and longitude) for map pins
    const results = rawResults
        .filter((prop: any) => {
            // Only include properties with valid coordinates
            // Decimal types come back as strings, so we need to parse them
            const lat = prop.latitude ? (typeof prop.latitude === 'string' ? parseFloat(prop.latitude) : Number(prop.latitude)) : null;
            const lon = prop.longitude ? (typeof prop.longitude === 'string' ? parseFloat(prop.longitude) : Number(prop.longitude)) : null;
            return lat != null && lon != null && !isNaN(lat) && !isNaN(lon);
        })
        .map((prop: any) => {
            const { companyName, buyerId, sellerId, ...rest } = prop;
            // Parse decimal types (they come as strings from the database)
            const lat = prop.latitude ? (typeof prop.latitude === 'string' ? parseFloat(prop.latitude) : Number(prop.latitude)) : null;
            const lon = prop.longitude ? (typeof prop.longitude === 'string' ? parseFloat(prop.longitude) : Number(prop.longitude)) : null;
            const baths = prop.bathrooms ? (typeof prop.bathrooms === 'string' ? parseFloat(prop.bathrooms) : Number(prop.bathrooms)) : null;
            const price = prop.price ? (typeof prop.price === 'string' ? parseFloat(prop.price) : Number(prop.price)) : 0;
            const companyId = (buyerId || sellerId) ? String(buyerId || sellerId) : null;
            const bid = buyerId ? String(buyerId) : null;
            const sid = sellerId ? String(sellerId) : null;
            
            return {
                ...rest,
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
                price: price,
                status: prop.status || '',
                propertyOwner: companyName || null,
                companyId,
                buyerId: bid,
                sellerId: sid,
            };
        });

    return results;
}