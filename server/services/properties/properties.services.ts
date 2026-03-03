import { db } from "server/storage";
import { properties, addresses, structures, lastSales, propertyTransactions } from "@database/schemas/properties.schema";
import { companies } from "@database/schemas/companies.schema";
import { normalizeCompanyNameForComparison } from "server/utils/normalization";
import { orderArmsLengthTransactions } from "server/utils/orderArmsLengthTransactions";
import { eq, sql, or, and, inArray, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const buyerCompanies = alias(companies, "buyer_companies");
const sellerCompanies = alias(companies, "seller_companies");

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
    companyId?: string; // Company ID filter - matches buyer_id OR seller_id
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

    const companyIdTrimmed = companyId && typeof companyId === 'string' ? companyId.trim() : '';
    const hasCompanyFilter = companyIdTrimmed !== '';

    // Status filter - build condition based on whether company is selected
    // When company selected: status rules depend on buyer/seller role (wholesale: buyer=in-renovation, seller=sold-wholesale)
    const statusesToUse = Array.isArray(status) ? status : status ? [status] : [];
    if (statusesToUse.length > 0) {
        const normalizedStatuses = statusesToUse.map(s => s.toString().trim().toLowerCase());
        const inRenovationSelected = normalizedStatuses.includes('in-renovation');
        const wholesaleSelected = normalizedStatuses.includes('wholesale');

        if (hasCompanyFilter) {
            // Company selected: status-specific company role logic
            // - in-renovation: buyer only (company owns/renovates)
            // - on-market: seller only (company is listing)
            // - sold: buyer or seller
            // - wholesale: buyer when in-renovation selected, seller when wholesale selected
            const statusParts: ReturnType<typeof sql>[] = [];
            if (inRenovationSelected) {
                statusParts.push(sql`(LOWER(TRIM(${properties.status})) = 'in-renovation' AND ${properties.buyerId} = ${companyIdTrimmed})`);
                statusParts.push(sql`(LOWER(TRIM(${properties.status})) = 'wholesale' AND ${properties.buyerId} = ${companyIdTrimmed})`);
            }
            if (wholesaleSelected) {
                statusParts.push(sql`(LOWER(TRIM(${properties.status})) = 'wholesale' AND ${properties.sellerId} = ${companyIdTrimmed})`);
            }
            if (normalizedStatuses.includes('on-market')) {
                statusParts.push(sql`(LOWER(TRIM(${properties.status})) = 'on-market' AND ${properties.sellerId} = ${companyIdTrimmed})`);
            }
            if (normalizedStatuses.includes('sold')) {
                statusParts.push(sql`(LOWER(TRIM(${properties.status})) = 'sold' AND (${properties.buyerId} = ${companyIdTrimmed} OR ${properties.sellerId} = ${companyIdTrimmed}))`);
            }
            if (statusParts.length > 0) {
                conditions.push(or(...statusParts) as any);
            } else {
                // Company selected but no status filters - show all properties for company
                conditions.push(
                    or(
                        eq(properties.buyerId, companyIdTrimmed),
                        eq(properties.sellerId, companyIdTrimmed)
                    ) as any
                );
            }
        } else {
            // No company: simple OR of statuses; also handle name-based company filter
            const ownerFilter = company || propertyOwner;
            if (ownerFilter) {
                const normalizedSearchTerm = normalizeCompanyNameForComparison(ownerFilter.toString());
                if (normalizedSearchTerm) {
                    conditions.push(
                        sql`(
                            LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${buyerCompanies.companyName}), '[,.\\;:]', '', 'g'), '\\s+', ' ', 'g')) = ${normalizedSearchTerm}
                            OR LOWER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${sellerCompanies.companyName}), '[,.\\;:]', '', 'g'), '\\s+', ' ', 'g')) = ${normalizedSearchTerm}
                        )`
                    );
                }
            }
            if (normalizedStatuses.length === 1) {
                conditions.push(
                    sql`LOWER(TRIM(${properties.status})) = ${normalizedStatuses[0]}`
                );
            } else {
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

    // Bedrooms filter (minimum bedrooms) - from structures table
    if (bedrooms) {
        const bedroomsStr = bedrooms.toString().trim().toLowerCase();
        if (bedroomsStr !== 'any') {
            const bedroomsNum = parseInt(bedroomsStr, 10);
            if (!isNaN(bedroomsNum)) {
                conditions.push(
                    sql`${structures.bedsCount} >= ${bedroomsNum}`
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
        const normalizedCounty = county.toString().trim().toLowerCase();
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            ) as any
        );
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
            sql`${lastSales.recordingDate} IS NOT NULL`
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
    if (ownerFilter && !companyId) {
        countQuery = countQuery
            .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id)) as any;
        countQuery = countQuery
            .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id)) as any;
    }
    
    if (whereClause) {
        countQuery = countQuery.where(whereClause) as any;
    }
    const [totalResult] = await countQuery.execute();
    const total = Number(totalResult?.count || 0);

    // Step 1: Get the ordered page of property IDs (ensures one row per property and correct pagination)
    let idQuery = db
        .select({ id: properties.id })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
        .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id));
    if (whereClause) {
        idQuery = idQuery.where(whereClause) as any;
    }
    const sortByValue = sortBy?.toString() || "recently-sold";
    switch (sortByValue) {
        case "recently-sold":
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${lastSales.recordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.recordingDate} AS DATE) DESC`,
                properties.id
            ) as any;
            break;
        case "days-held":
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${lastSales.recordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`(EXTRACT(EPOCH FROM (NOW() - ${lastSales.recordingDate})) / 86400) DESC`,
                properties.id
            ) as any;
            break;
        case "price-high-low":
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${lastSales.price} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.price} AS REAL) DESC`,
                properties.id
            ) as any;
            break;
        case "price-low-high":
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${lastSales.price} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.price} AS REAL) ASC`,
                properties.id
            ) as any;
            break;
        default:
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${lastSales.recordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`CAST(${lastSales.recordingDate} AS DATE) DESC`,
                properties.id
            ) as any;
    }
    const idRows = await idQuery.limit(limitNum + 1).offset(offset).execute();
    const pageIds = idRows.map((r: { id: string }) => r.id);
    const hasMore = pageIds.length > limitNum;
    const idsForPage = hasMore ? pageIds.slice(0, limitNum) : pageIds;

    if (idsForPage.length === 0) {
        return {
            properties: [],
            total,
            hasMore: false,
            page: pageNum,
            limit: limitNum,
        };
    }

    // Step 2: Fetch full rows for this page of IDs and preserve order
    // Step 2: Fetch full rows for this page of IDs and preserve order
    let query = db
        .select({
            // Properties table fields
            id: properties.id,
            propertyType: properties.propertyType,
            status: properties.status,
            buyerId: properties.buyerId,
            sellerId: properties.sellerId,
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
            // Last Sale fields (dateSold = recording_date for "Date Sold" display)
            price: sql<number | null>`CAST(${lastSales.price} AS REAL)`,
            dateSold: lastSales.recordingDate,
            // Buyer company info
            buyerCompanyName: buyerCompanies.companyName,
            buyerContactName: buyerCompanies.contactName,
            buyerContactEmail: buyerCompanies.contactEmail,
            buyerContactPhone: buyerCompanies.phoneNumber,
            // Seller company info
            sellerCompanyName: sellerCompanies.companyName,
            sellerContactName: sellerCompanies.contactName,
            sellerContactEmail: sellerCompanies.contactEmail,
            sellerContactPhone: sellerCompanies.phoneNumber,
            // Legacy company info (buyer as primary, seller as fallback)
            companyName: sql<string>`COALESCE(${buyerCompanies.companyName}, ${sellerCompanies.companyName})`,
            contactName: sql<string | null>`COALESCE(${buyerCompanies.contactName}, ${sellerCompanies.contactName})`,
            contactEmail: sql<string | null>`COALESCE(${buyerCompanies.contactEmail}, ${sellerCompanies.contactEmail})`,
            contactPhone: sql<string | null>`COALESCE(${buyerCompanies.phoneNumber}, ${sellerCompanies.phoneNumber})`,
        })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
        .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
        .where(inArray(properties.id, idsForPage));
    
    // Preserve sort order from the id query (order results by position in idsForPage)
    const idToIndex = new Map(idsForPage.map((id, i) => [id, i]));
    const results = (await query.execute()).sort((a: any, b: any) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0));
    const rawPropertiesList = results;

    // Fetch Arms Length transactions for this page (for fallback buyer/seller names and spread)
    const armsLengthTxs = await db
        .select({
            propertyId: propertyTransactions.propertyId,
            buyerId: propertyTransactions.buyerId,
            buyerName: propertyTransactions.buyerName,
            sellerId: propertyTransactions.sellerId,
            sellerName: propertyTransactions.sellerName,
            salePrice: propertyTransactions.salePrice,
            recordingDate: propertyTransactions.recordingDate,
            saleDate: propertyTransactions.saleDate,
            id: propertyTransactions.propertyTransactionsId,
        })
        .from(propertyTransactions)
        .where(
            and(
                inArray(propertyTransactions.propertyId, idsForPage),
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`
            )
        )
        .orderBy(
            propertyTransactions.propertyId,
            desc(propertyTransactions.recordingDate),
            desc(propertyTransactions.propertyTransactionsId)
        );

    // Group by property; then reorder so same-day flips: "chain end" (buyer not seller that day) is first
    type TxRow = (typeof armsLengthTxs)[number];
    const transactionsByPropertyId = new Map<string, TxRow[]>();
    for (const row of armsLengthTxs) {
        const pid = row.propertyId;
        if (!transactionsByPropertyId.has(pid)) {
            transactionsByPropertyId.set(pid, []);
        }
        transactionsByPropertyId.get(pid)!.push(row);
    }
    transactionsByPropertyId.forEach((list, pid) => {
        transactionsByPropertyId.set(pid, orderArmsLengthTransactions(list));
    });

    // Helper: normalize name for comparison (trim + lower)
    const nameKey = (s: string | null | undefined) => (s != null ? String(s).trim().toLowerCase() : "");

    // Map results to flat Property structure expected by frontend
    const propertiesList = rawPropertiesList.map((prop: any) => {
        const lat = prop.latitude ? Number(prop.latitude) : null;
        const lon = prop.longitude ? Number(prop.longitude) : null;
        const price = prop.price ? Number(prop.price) : 0;
        const baths = prop.bathrooms ? Number(prop.bathrooms) : 0;
        const dateSoldStr = prop.dateSold ? (prop.dateSold instanceof Date ? prop.dateSold.toISOString().split('T')[0] : prop.dateSold) : null;

        const txs = transactionsByPropertyId.get(prop.id) ?? []; // already reordered by orderArmsLengthTransactions
        const latest = txs[0] ?? null;

        // Fallback buyer/seller names from most recent Arms Length transaction when company is null
        const buyerDisplayName = prop.buyerCompanyName || (latest?.buyerName ?? null);
        const sellerDisplayName = prop.sellerCompanyName || (latest?.sellerName ?? null);

        let buyerPurchasePrice: number | null = null;
        let sellerPurchasePrice: number | null = null;
        let buyerPurchaseDate: string | null = null;
        let sellerPurchaseDate: string | null = null;
        if (latest?.salePrice != null) {
            buyerPurchasePrice = Number(latest.salePrice);
        }
        if (latest?.recordingDate) {
            buyerPurchaseDate = typeof latest.recordingDate === 'string' ? latest.recordingDate : (latest.recordingDate as Date).toISOString().split('T')[0];
        }
        if (latest) {
            for (let i = 1; i < txs.length; i++) {
                const tx = txs[i];
                const matchById = latest.sellerId && tx.buyerId && latest.sellerId === tx.buyerId;
                const matchByName = latest.sellerName && tx.buyerName && nameKey(tx.buyerName) === nameKey(latest.sellerName);
                if (matchById || matchByName) {
                    if (tx.salePrice != null) sellerPurchasePrice = Number(tx.salePrice);
                    if (tx.recordingDate) {
                        sellerPurchaseDate = typeof tx.recordingDate === 'string' ? tx.recordingDate : (tx.recordingDate as Date).toISOString().split('T')[0];
                    }
                    break;
                }
            }
        }
        const spread =
            buyerPurchasePrice != null && sellerPurchasePrice != null
                ? buyerPurchasePrice - sellerPurchasePrice
                : null;

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
            // Company info (buyer as primary, seller as fallback - companyId for frontend filter/display)
            companyId: prop.buyerId ? String(prop.buyerId) : (prop.sellerId ? String(prop.sellerId) : null),
            buyerId: prop.buyerId ? String(prop.buyerId) : null,
            sellerId: prop.sellerId ? String(prop.sellerId) : null,
            buyerCompanyName: buyerDisplayName,
            buyerContactName: prop.buyerContactName || null,
            buyerContactEmail: prop.buyerContactEmail || null,
            buyerContactPhone: prop.buyerContactPhone || null,
            sellerCompanyName: sellerDisplayName,
            sellerContactName: prop.sellerContactName || null,
            sellerContactEmail: prop.sellerContactEmail || null,
            sellerContactPhone: prop.sellerContactPhone || null,
            companyName: prop.companyName || buyerDisplayName || sellerDisplayName || null,
            companyContactName: prop.contactName || null,
            companyContactEmail: prop.contactEmail || null,
            companyContactPhone: prop.contactPhone || null,
            // Spread from Arms Length transactions: buyer paid, seller's prior purchase, spread; recording dates for those txs
            buyerPurchasePrice,
            buyerPurchaseDate,
            sellerPurchasePrice,
            sellerPurchaseDate,
            spread,
            sellerName: sellerDisplayName,
            // Legacy aliases for backward compatibility
            propertyOwner: prop.companyName || buyerDisplayName || sellerDisplayName || null,
            propertyOwnerId: prop.buyerId ? String(prop.buyerId) : (prop.sellerId ? String(prop.sellerId) : null),
            // Additional fields that might be expected by frontend but not directly in new schema
            description: null,
            imageUrl: null,
            purchasePrice: sellerPurchasePrice,
            saleValue: buyerPurchasePrice,
            isCorporate: null,
            isCashBuyer: null,
            isDiscountedPurchase: null,
            isPrivateLender: null,
            buyerPropertiesCount: null,
            buyerTransactionsCount: null,
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
