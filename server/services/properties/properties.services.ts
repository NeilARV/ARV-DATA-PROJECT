import { db } from "server/storage";
import { properties } from "@shared/schema";
import { companyContacts } from "@shared/schema";
import { normalizeCompanyNameForComparison } from "server/utils/normalizeCompanyName";
import { eq, sql, or, and, desc, asc } from "drizzle-orm";

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
    propertyOwnerId?: string;
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
        propertyOwnerId,
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

    // Company/Property Owner filter
    // Priority: propertyOwnerId > company/propertyOwner (for backward compatibility)
    if (propertyOwnerId && typeof propertyOwnerId === 'string' && propertyOwnerId.trim() !== '') {
        // Direct ID filter - most efficient and reliable
        conditions.push(
            eq(properties.propertyOwnerId, propertyOwnerId.trim())
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
                    sql`LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${companyContacts.companyName}), '[,.\\;:]', '', 'g'), '\\s+', ' ', 'g')) = ${normalizedSearchTerm}`
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

    // Bathrooms filter (minimum bathrooms)
    if (bathrooms) {
        const bathroomsStr = bathrooms.toString().trim().toLowerCase();
        if (bathroomsStr !== 'any') {
            const bathroomsNum = parseFloat(bathroomsStr);
            if (!isNaN(bathroomsNum)) {
                conditions.push(
                    sql`${properties.bathrooms} >= ${bathroomsNum}`
                )
            }
        }
    }

    // Bedrooms filter (exact match)
    if (bedrooms) {
        const bedroomsStr = bedrooms.toString().trim().toLowerCase();
        if (bedroomsStr !== 'any') {
            const bedroomsNum = parseInt(bedroomsStr, 10);
            if (!isNaN(bedroomsNum)) {
                conditions.push(
                    sql`${properties.bedrooms} = ${bedroomsNum}`
                )
            }
        }
    }
    
    // Price range filter (handle min, max, or both)
    if (minPrice) {
        const minPriceNum = parseFloat(minPrice.toString());
        if (!isNaN(minPriceNum)) {
            conditions.push(
                sql`${properties.price} >= ${minPriceNum}`
            )
        }
    }

    if (maxPrice) {
        const maxPriceNum = parseFloat(maxPrice.toString());
        if (!isNaN(maxPriceNum)) {
            conditions.push(
                sql`${properties.price} <= ${maxPriceNum}`
            )
        }
    }

    // County filter
    if (county) {
        const normalizedCounty = county.toString().trim().toLowerCase()
        conditions.push(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`
        )
    }

    // Zipcode filter
    if (zipcode) {
        const normalizedZipcode = zipcode.toString().trim()
        conditions.push(
            sql`TRIM(${properties.zipCode}) = ${normalizedZipcode}`
        )
    }

    // City filter
    if (city) {
        const normalizedCity = city.toString().trim().toLowerCase()
        conditions.push(
            sql`LOWER(TRIM(${properties.city})) = ${normalizedCity}`
        )
    }

    // Has Date Sold filter
    if (hasDateSold === "true") {
        conditions.push(
            sql`${properties.dateSold} IS NOT NULL`
        )
    }

    // Build where clause
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Get total count (for pagination metadata)
    // Must include LEFT JOIN if company name filter is used (since WHERE clause references companyContacts)
    // propertyOwnerId filter doesn't need JOIN since it filters directly on properties.propertyOwnerId
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(properties);
    const ownerFilter = company || propertyOwner;
    if (ownerFilter && !propertyOwnerId) {
        // If company name filter is used (and not ID filter), we need the JOIN for the WHERE clause to work
        countQuery = countQuery.leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id)) as any;
    }
    if (whereClause) {
        countQuery = countQuery.where(whereClause) as any;
    }
    const [totalResult] = await countQuery.execute();
    const total = Number(totalResult?.count || 0);

    // Get paginated results (fetch one extra to check if there are more pages)
    // Use LEFT JOIN to get company info from company_contacts table
    let query = db
        .select({
            // All property fields
            id: properties.id,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zipCode: properties.zipCode,
            county: properties.county,
            price: properties.price,
            bedrooms: properties.bedrooms,
            bathrooms: properties.bathrooms,
            squareFeet: properties.squareFeet,
            propertyType: properties.propertyType,
            imageUrl: properties.imageUrl,
            latitude: properties.latitude,
            longitude: properties.longitude,
            description: properties.description,
            yearBuilt: properties.yearBuilt,
            propertyOwnerId: properties.propertyOwnerId,
            purchasePrice: properties.purchasePrice,
            dateSold: properties.dateSold,
            status: properties.status,
            buyerName: properties.buyerName,
            buyerFormattedName: properties.buyerFormattedName,
            phone: properties.phone,
            isCorporate: properties.isCorporate,
            isCashBuyer: properties.isCashBuyer,
            isDiscountedPurchase: properties.isDiscountedPurchase,
            isPrivateLender: properties.isPrivateLender,
            buyerPropertiesCount: properties.buyerPropertiesCount,
            buyerTransactionsCount: properties.buyerTransactionsCount,
            sellerName: properties.sellerName,
            lenderName: properties.lenderName,
            exitValue: properties.exitValue,
            exitBuyerName: properties.exitBuyerName,
            profitLoss: properties.profitLoss,
            holdDays: properties.holdDays,
            saleValue: properties.saleValue,
            avmValue: properties.avmValue,
            loanAmount: properties.loanAmount,
            sfrPropertyId: properties.sfrPropertyId,
            sfrRecordId: properties.sfrRecordId,
            msa: properties.msa,
            recordingDate: properties.recordingDate,
            createdAt: properties.createdAt,
            updatedAt: properties.updatedAt,
            // Company info from joined table
            companyName: companyContacts.companyName,
            contactName: companyContacts.contactName,
            contactEmail: companyContacts.contactEmail,
        })
        .from(properties)
        .leftJoin(companyContacts, eq(properties.propertyOwnerId, companyContacts.id));
    
    if (whereClause) {
        query = query.where(whereClause) as any;
    }

    // Apply sorting based on sortBy parameter
    const sortByValue = sortBy?.toString() || "recently-sold";
    switch (sortByValue) {
        case "recently-sold":
            // Sort by recordingDate DESC (most recent first), nulls last
            // Using recordingDate since that's what's displayed as "Purchased Date" in the UI
            // Explicitly cast to date to ensure proper chronological sorting
            query = query.orderBy(
                sql`CASE WHEN ${properties.recordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${properties.recordingDate} AS DATE) DESC`
            ) as any;
            break;
        case "days-held":
            // Sort by days held (calculated from dateSold to now) DESC (longest first), nulls last
            // Calculate days held: (NOW() - dateSold) in days
            query = query.orderBy(
                sql`CASE WHEN ${properties.dateSold} IS NULL THEN 1 ELSE 0 END`,
                sql`(EXTRACT(EPOCH FROM (NOW() - ${properties.dateSold})) / 86400) DESC`
            ) as any;
            break;
        case "price-high-low":
            // Sort by price DESC
            query = query.orderBy(desc(properties.price)) as any;
            break;
        case "price-low-high":
            // Sort by price ASC
            query = query.orderBy(asc(properties.price)) as any;
            break;
        default:
            // Default to recently-sold
            query = query.orderBy(
                sql`CASE WHEN ${properties.recordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${properties.recordingDate} AS DATE) DESC`
            ) as any;
    }

    const results = await query.limit(limitNum + 1).offset(offset).execute();

    const hasMore = results.length > limitNum;
    const rawPropertiesList = results.slice(0, limitNum);

    // Map results to use company info from joined table, fallback to legacy fields
    const propertiesList = rawPropertiesList.map((prop: any) => {
        // Use company info from joined table if available, otherwise use legacy fields
        const { companyName, contactName, contactEmail, ...rest } = prop;
        return {
            ...rest,
            propertyOwner: companyName || prop.propertyOwner || null,
            companyContactName: contactName || prop.companyContactName || null,
            companyContactEmail: contactEmail || prop.companyContactEmail || null,
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

