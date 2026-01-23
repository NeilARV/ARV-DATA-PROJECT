import { db } from "server/storage";
import { properties, addresses, structures, lastSales } from "../../../database/schemas/properties.schema";
import { companies } from "../../../database/schemas/companies.schema";
import { normalizeCompanyNameForComparison } from "server/utils/normalization";
import { eq, sql, or, and } from "drizzle-orm";

export interface GetPropertiesFilters {
    zipcode?: string;
    city?: string;
    county?: string;
    minPrice?: string;
    maxPrice?: string;
    bedrooms?: string;
    bathrooms?: string;
    propertyType?: string | string[];
    status?: string | string[];
    company?: string;
    propertyOwner?: string;
    companyId?: string; // Primary company ID filter (more reliably filled)
    propertyOwnerId?: string; // Legacy, use companyId instead
    hasDateSold?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
}

export interface GetPropertiesResult {
    properties: any[];
    total: number;
    hasMore: boolean;
    page: number;
    limit: number;
}

export async function getProperties(filters: GetPropertiesFilters): Promise<GetPropertiesResult> {
    const { 
        zipcode, 
        city, 
        county, 
        minPrice, 
        maxPrice, 
        bedrooms, 
        bathrooms, 
        propertyType, 
        status, 
        company, 
        propertyOwner, 
        companyId,
        propertyOwnerId, // Legacy, use companyId instead
        hasDateSold,
        page,
        limit,
        sortBy
    } = filters;

    // Parse pagination parameters
    const pageNum = page ? Math.max(1, parseInt(page.toString(), 10)) : 1;
    const limitNum = limit ? Math.max(1, parseInt(limit.toString(), 10)) : 10; // Default to 10 per page
    const offset = (pageNum - 1) * limitNum;

    const conditions = []

    // Company filter
    // Priority: companyId > propertyOwnerId (legacy) > company/propertyOwner name
    // companyId is the primary filter as it's more reliably filled for in-renovation and sold properties
    if (companyId && typeof companyId === 'string' && companyId.trim() !== '') {
        // Direct companyId filter - most efficient and reliable
        conditions.push(
            eq(properties.companyId, companyId.trim())
        );
    } else if (propertyOwnerId && typeof propertyOwnerId === 'string' && propertyOwnerId.trim() !== '') {
        // Legacy fallback to propertyOwnerId
        conditions.push(
            eq(properties.companyId, propertyOwnerId.trim()) // Map to companyId for compatibility
        );
    } else {
        // Fallback to name-based filter (for backward compatibility)
        const ownerFilter = company || propertyOwner;
        if (ownerFilter) {
            // Normalize the search term the same way company names are stored
            const normalizedSearchTerm = normalizeCompanyNameForComparison(ownerFilter.toString());
            if (normalizedSearchTerm) {
                // Compare normalized versions: remove punctuation and normalize spaces
                // We need to normalize the database value in SQL for comparison
                conditions.push(
                    sql`LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${companies.companyName}), '[,.\\;:]', '', 'g'), '\\s+', ' ', 'g')) = ${normalizedSearchTerm}`
                )
            }
        }
    }

    // Status filter (can be single value or array)
    if (status) {
        const statusArray = Array.isArray(status) ? status : [status];
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

    // Property Type filter (can be single value or array)
    if (propertyType) {
        const typeArray = Array.isArray(propertyType) ? propertyType : [propertyType];
        if (typeArray.length > 0) {
            const normalizedTypes = typeArray.map(t => t.toString().trim().toLowerCase());
            if (normalizedTypes.length === 1) {
                conditions.push(
                    sql`LOWER(TRIM(${properties.propertyType})) = ${normalizedTypes[0]}`
                );
            } else {
                // Use OR for multiple property type values
                conditions.push(
                    or(...normalizedTypes.map(t => 
                        sql`LOWER(TRIM(${properties.propertyType})) = ${t}`
                    )) as any
                );
            }
        }
    }

    // Bathrooms filter (minimum bathrooms) - from structures table
    if (bathrooms) {
        const bathroomsStr = bathrooms.toString().trim().toLowerCase();
        if (bathroomsStr !== 'any') {
            const bathroomsNum = parseFloat(bathroomsStr);
            if (!isNaN(bathroomsNum)) {
                conditions.push(
                    sql`CAST(${structures.baths} AS REAL) >= ${bathroomsNum}`
                )
            }
        }
    }

    // Bedrooms filter (exact match) - from structures table
    if (bedrooms) {
        const bedroomsStr = bedrooms.toString().trim().toLowerCase();
        if (bedroomsStr !== 'any') {
            const bedroomsNum = parseInt(bedroomsStr, 10);
            if (!isNaN(bedroomsNum)) {
                conditions.push(
                    sql`${structures.bedsCount} = ${bedroomsNum}`
                )
            }
        }
    }
    
    // Price range filter (handle min, max, or both) - from lastSales table
    if (minPrice) {
        const minPriceNum = parseFloat(minPrice.toString());
        if (!isNaN(minPriceNum)) {
            conditions.push(
                sql`CAST(${lastSales.price} AS REAL) >= ${minPriceNum}`
            )
        }
    }

    if (maxPrice) {
        const maxPriceNum = parseFloat(maxPrice.toString());
        if (!isNaN(maxPriceNum)) {
            conditions.push(
                sql`CAST(${lastSales.price} AS REAL) <= ${maxPriceNum}`
            )
        }
    }

    // County filter - check both properties.county and addresses.county
    if (county) {
        const normalizedCounty = county.toString().trim().toLowerCase()
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            ) as any
        )
    }

    // Zipcode filter - from addresses table
    if (zipcode) {
        const normalizedZipcode = zipcode.toString().trim()
        conditions.push(
            sql`TRIM(${addresses.zipCode}) = ${normalizedZipcode}`
        )
    }

    // City filter - from addresses table
    if (city) {
        const normalizedCity = city.toString().trim().toLowerCase()
        conditions.push(
            sql`LOWER(TRIM(${addresses.city})) = ${normalizedCity}`
        )
    }

    // Has Date Sold filter - from lastSales table
    if (hasDateSold === "true") {
        conditions.push(
            sql`${lastSales.saleDate} IS NOT NULL`
        )
    }

    // Build where clause
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Get total count (for pagination metadata)
    // Must include LEFT JOINs for filters that reference joined tables
    // Use DISTINCT to avoid counting duplicates from multiple LEFT JOINs
    let countQuery = db.select({ count: sql<number>`count(DISTINCT ${properties.id})` }).from(properties);
    
    // Always join addresses (required for most filters)
    countQuery = countQuery.leftJoin(addresses, eq(properties.id, addresses.propertyId)) as any;
    
    // Join structures if bedrooms or bathrooms filter is used
    if (bedrooms || bathrooms) {
        countQuery = countQuery.leftJoin(structures, eq(properties.id, structures.propertyId)) as any;
    }
    
    // Join lastSales if price or hasDateSold filter is used
    if (minPrice || maxPrice || hasDateSold) {
        countQuery = countQuery.leftJoin(lastSales, eq(properties.id, lastSales.propertyId)) as any;
    }
    
    // Join companies if company name filter is used (and not ID filter)
    const ownerFilter = company || propertyOwner;
    if (ownerFilter && !companyId && !propertyOwnerId) {
        countQuery = countQuery.leftJoin(companies, eq(properties.companyId, companies.id)) as any;
    }
    
    if (whereClause) {
        countQuery = countQuery.where(whereClause) as any;
    }
    const [totalResult] = await countQuery.execute();
    const total = Number(totalResult?.count || 0);

    // Get paginated results (fetch one extra to check if there are more pages)
    // Join all necessary tables
    let query = db
        .select({
            // Properties table fields
            id: properties.id,
            propertyType: properties.propertyType,
            status: properties.status,
            companyId: properties.companyId, // Use companyId (more reliably filled)
            msa: properties.msa,
            county: sql<string>`COALESCE(${properties.county}, ${addresses.county})`,
            createdAt: properties.createdAt,
            updatedAt: properties.updatedAt,
            // Address fields
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipCode: addresses.zipCode,
            latitude: sql<number | null>`CAST(${addresses.latitude} AS REAL)`,
            longitude: sql<number | null>`CAST(${addresses.longitude} AS REAL)`,
            // Structure fields
            bedrooms: structures.bedsCount,
            bathrooms: sql<number | null>`CAST(${structures.baths} AS REAL)`,
            squareFeet: structures.totalAreaSqFt,
            yearBuilt: structures.yearBuilt,
            // Last Sale fields
            price: sql<number | null>`CAST(${lastSales.price} AS REAL)`,
            dateSold: lastSales.saleDate,
            // Company info (joined on companyId)
            companyName: companies.companyName,
            contactName: companies.contactName,
            contactEmail: companies.contactEmail,
        })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(companies, eq(properties.companyId, companies.id)); // Join on companyId
    
    if (whereClause) {
        query = query.where(whereClause) as any;
    }

    // Apply sorting based on sortBy parameter
    const sortByValue = sortBy?.toString() || "recently-sold";
    switch (sortByValue) {
        case "recently-sold":
            // Sort by saleDate DESC (most recent first), nulls last
            query = query.orderBy(
                sql`CASE WHEN ${lastSales.saleDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.saleDate} AS DATE) DESC`
            ) as any;
            break;
        case "days-held":
            // Sort by days held (calculated from dateSold to now) DESC (longest first), nulls last
            query = query.orderBy(
                sql`CASE WHEN ${lastSales.saleDate} IS NULL THEN 1 ELSE 0 END`,
                sql`(EXTRACT(EPOCH FROM (NOW() - ${lastSales.saleDate})) / 86400) DESC`
            ) as any;
            break;
        case "price-high-low":
            // Sort by price DESC
            query = query.orderBy(
                sql`CASE WHEN ${lastSales.price} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.price} AS REAL) DESC`
            ) as any;
            break;
        case "price-low-high":
            // Sort by price ASC
            query = query.orderBy(
                sql`CASE WHEN ${lastSales.price} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.price} AS REAL) ASC`
            ) as any;
            break;
        default:
            // Default to recently-sold
            query = query.orderBy(
                sql`CASE WHEN ${lastSales.saleDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.saleDate} AS DATE) DESC`
            ) as any;
    }

    const results = await query.limit(limitNum + 1).offset(offset).execute();

    const hasMore = results.length > limitNum;
    const rawPropertiesList = results.slice(0, limitNum);

    // Map results to flat Property structure expected by frontend
    const propertiesList = rawPropertiesList.map((prop: any) => {
        const lat = prop.latitude ? Number(prop.latitude) : null;
        const lon = prop.longitude ? Number(prop.longitude) : null;
        const price = prop.price ? Number(prop.price) : 0;
        const baths = prop.bathrooms ? Number(prop.bathrooms) : 0;
        const dateSoldStr = prop.dateSold ? (prop.dateSold instanceof Date ? prop.dateSold.toISOString().split('T')[0] : prop.dateSold) : null;

        return {
            id: prop.id,
            // Address info
            address: prop.address || '',
            city: prop.city || '',
            state: prop.state || '',
            zipCode: prop.zipCode || '',
            county: prop.county || '',
            latitude: lat,
            longitude: lon,
            // Structure fields
            bedrooms: prop.bedrooms ? Number(prop.bedrooms) : 0,
            bathrooms: baths,
            squareFeet: prop.squareFeet ? Number(prop.squareFeet) : 0,
            yearBuilt: prop.yearBuilt ? Number(prop.yearBuilt) : null,
            // Property fields
            propertyType: prop.propertyType || '',
            status: prop.status || 'in-renovation',
            // Price and date
            price: price,
            dateSold: dateSoldStr,
            // Company info (using companyId, more reliably filled)
            companyId: prop.companyId ? String(prop.companyId) : null,
            companyName: prop.companyName || null,
            companyContactName: prop.contactName || null,
            companyContactEmail: prop.contactEmail || null,
            // Legacy aliases for backward compatibility
            propertyOwner: prop.companyName || null,
            propertyOwnerId: prop.companyId ? String(prop.companyId) : null, // Map to companyId for compatibility
            // Additional fields that might be expected by frontend but not directly in new schema
            description: null,
            imageUrl: null,
            purchasePrice: null,
            saleValue: null,
            isCorporate: null,
            isCashBuyer: null,
            isDiscountedPurchase: null,
            isPrivateLender: null,
            buyerPropertiesCount: null,
            buyerTransactionsCount: null,
            sellerName: null,
            lenderName: null,
            exitValue: null,
            exitBuyerName: null,
            profitLoss: null,
            holdDays: null,
            avmValue: null,
            loanAmount: null,
            msa: prop.msa || null,
            createdAt: prop.createdAt,
            updatedAt: prop.updatedAt,
        };
    });

    console.log(`Properties: ${propertiesList.length} returned, ${total} total, hasMore: ${hasMore}, page: ${pageNum}`)
    
    return {
        properties: propertiesList,
        total,
        hasMore,
        page: pageNum,
        limit: limitNum,
    };
}
