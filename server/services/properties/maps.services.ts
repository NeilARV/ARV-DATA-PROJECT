import { db } from "server/storage";
import { properties, companyContacts } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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
}

/**
 * Fetches minimal property data for map pins
 * @param county - Optional county filter
 * @returns Array of property data formatted for map display
 */
export async function getMapProperties(county?: string): Promise<MapPropertyData[]> {
    const conditions = [];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
        );
    }

    const whereClause = conditions.length > 0 ? conditions[0] : undefined;

    // Select only minimal fields needed for map pins and filtering
    // Use LEFT JOIN to get company name from company_contacts table
    let query = db
        .select({
            id: properties.id,
            latitude: properties.latitude,
            longitude: properties.longitude,
            address: properties.address,
            city: properties.city,
            zipcode: properties.zipCode,
            county: properties.county,
            propertyType: properties.propertyType,
            bedrooms: properties.bedrooms,
            bathrooms: properties.bathrooms,
            price: properties.price,
            status: properties.status,
            // Company name from joined table
            companyName: companyContacts.companyName,
        })
        .from(properties)
        .leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id));

    if (whereClause) {
        query = query.where(whereClause) as any;
    }

    const rawResults = await query.execute();

    // Map results to use companyName as propertyOwner for backward compatibility
    const results = rawResults.map((prop: any) => {
        const { companyName, ...rest } = prop;
        return {
            ...rest,
            propertyOwner: companyName || null,
        };
    });

    return results;
}