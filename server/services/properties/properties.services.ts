import { db } from "server/storage";
import { properties, addresses, structures, lastSales, propertyTransactions } from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { companies } from "@database/schemas/companies.schema";
import { trimCompanyName } from "server/utils/normalization";
import { sortTransactionsDesc, calculateSpread } from "server/utils/orderTransactions";
import { eq, sql, or, and, inArray, desc, gte, lte } from "drizzle-orm";
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
    dateMin?: string; // YYYY-MM-DD
    dateMax?: string; // YYYY-MM-DD
    page?: string;
    limit?: string;
    sortBy?: string;
    search?: string; // Full-text search across address, city, state, zip
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
        dateMin,
        dateMax,
        page,
        limit,
        sortBy,
        search,
    } = filters;

    // Parse pagination parameters
    const pageNum = page ? Math.max(1, parseInt(page.toString(), 10)) : 1;
    const limitNum = limit ? Math.max(1, parseInt(limit.toString(), 10)) : 10; // Default to 10 per page
    const offset = (pageNum - 1) * limitNum;

    const conditions = []

    // Full-text search across address, city, state, zip
    if (search && search.trim().length > 0) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        conditions.push(
            or(
                sql`LOWER(TRIM(${addresses.formattedStreetAddress})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.city})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.state})) LIKE ${searchTerm}`,
                sql`LOWER(TRIM(${addresses.zipCode})) LIKE ${searchTerm}`,
            ) as any
        );
    }

    const companyIdTrimmed = companyId && typeof companyId === 'string' ? companyId.trim() : '';
    const hasCompanyFilter = companyIdTrimmed !== '';

    // When company is selected: match properties where company is buyer OR seller.
    // Sold properties have the company as sellerId (new owner is buyerId), so OR is needed to show them.
    if (hasCompanyFilter) {
        conditions.push(
            or(
                eq(properties.buyerId, companyIdTrimmed),
                eq(properties.sellerId, companyIdTrimmed)
            ) as any
        );
    }

    // Status filter (and optional name-based company filter when no company ID).
    // When company is selected we still apply status so the UI can show "X of Y Properties" (filtered count of total owned).
    const statusesToUse = Array.isArray(status) ? status : status ? [status] : [];
    if (statusesToUse.length > 0) {
        const normalizedStatuses = statusesToUse.map(s => s.toString().trim().toLowerCase());
        if (!hasCompanyFilter) {
            const ownerFilter = company || propertyOwner;
            if (ownerFilter) {
                const searchTerm = trimCompanyName(ownerFilter.toString());
                if (searchTerm) {
                    conditions.push(
                        or(
                            eq(buyerCompanies.companyName, searchTerm),
                            eq(sellerCompanies.companyName, searchTerm)
                        ) as any
                    );
                }
            }
        }
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_statuses ps
                JOIN statuses s ON s.id = ps.status_id
                WHERE ps.property_id = ${properties.id}
                AND LOWER(s.name) = ANY(ARRAY[${sql.join(normalizedStatuses.map(s => sql`${s}`), sql`, `)}])
            )`
        );
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

    // Date range filter - from lastSales table
    if (dateMin) {
        conditions.push(gte(lastSales.recordingDate, dateMin as string));
    }
    if (dateMax) {
        conditions.push(lte(lastSales.recordingDate, dateMax as string));
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
    
    // Join lastSales if price, hasDateSold, or date range filter is used
    if (minPrice || maxPrice || hasDateSold || dateMin || dateMax) {
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

    // Fetch statuses for this page of properties
    const propertyStatusRows = await db
        .select({ propertyId: propertyStatuses.propertyId, statusName: statuses.name })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(inArray(propertyStatuses.propertyId, idsForPage));
    const statusesByPropertyId = new Map<string, string[]>();
    for (const row of propertyStatusRows) {
        if (!statusesByPropertyId.has(row.propertyId)) statusesByPropertyId.set(row.propertyId, []);
        statusesByPropertyId.get(row.propertyId)!.push(row.statusName);
    }

    // Step 2: Fetch full rows for this page of IDs and preserve order
    let query = db
        .select({
            // Properties table fields
            id: properties.id,
            propertyType: properties.propertyType,
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
            // ARV funded flag — sourced directly from the DB column set by the pipeline
            isArvFunded: properties.isArvFunded,
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

    // Fetch ALL transactions for this page (for spread, fallback names and ARV Finance check)
    const allTxs = await db
        .select({
            propertyId: propertyTransactions.propertyId,
            buyerId: propertyTransactions.buyerId,
            buyerName: propertyTransactions.buyerName,
            sellerId: propertyTransactions.sellerId,
            sellerName: propertyTransactions.sellerName,
            salePrice: propertyTransactions.salePrice,
            recordingDate: propertyTransactions.recordingDate,
            saleDate: propertyTransactions.saleDate,
            transactionType: propertyTransactions.transactionType,
            id: propertyTransactions.propertyTransactionsId,
            firstMtgLenderName: propertyTransactions.firstMtgLenderName,
        })
        .from(propertyTransactions)
        .where(inArray(propertyTransactions.propertyId, idsForPage))
        .orderBy(
            propertyTransactions.propertyId,
            desc(propertyTransactions.recordingDate),
            desc(propertyTransactions.propertyTransactionsId)
        );

    // Group by property; sort all transactions using recording_date → chain detection → sale_date
    type TxRow = (typeof allTxs)[number];
    const transactionsByPropertyId = new Map<string, TxRow[]>();
    for (const row of allTxs) {
        const pid = row.propertyId;
        if (!transactionsByPropertyId.has(pid)) {
            transactionsByPropertyId.set(pid, []);
        }
        transactionsByPropertyId.get(pid)!.push(row);
    }
    transactionsByPropertyId.forEach((list, pid) => {
        transactionsByPropertyId.set(pid, sortTransactionsDesc(list));
    });

    // Pre-pass: collect transaction-derived company IDs for properties where the property's own
    // buyerId/sellerId is null, so we can batch-fetch contact info as a fallback.
    const txFallbackCompanyIds = new Set<string>();
    for (const prop of rawPropertiesList as any[]) {
        const txs = transactionsByPropertyId.get(prop.id) ?? [];
        const { latestArmsLengthTx } = calculateSpread(txs);
        if (!prop.buyerId && latestArmsLengthTx?.buyerId) txFallbackCompanyIds.add(latestArmsLengthTx.buyerId);
        if (!prop.sellerId && latestArmsLengthTx?.sellerId) txFallbackCompanyIds.add(latestArmsLengthTx.sellerId);
    }
    type CompanyContact = { id: string; contactName: string | null; contactEmail: string | null; phoneNumber: string | null };
    const txFallbackCompanyMap = new Map<string, CompanyContact>();
    if (txFallbackCompanyIds.size > 0) {
        const fallbackRows = await db
            .select({ id: companies.id, contactName: companies.contactName, contactEmail: companies.contactEmail, phoneNumber: companies.phoneNumber })
            .from(companies)
            .where(inArray(companies.id, Array.from(txFallbackCompanyIds)));
        for (const row of fallbackRows) txFallbackCompanyMap.set(row.id, row);
    }

    // Map results to flat Property structure expected by frontend
    const propertiesList = rawPropertiesList.map((prop: any) => {
        const lat = prop.latitude ? Number(prop.latitude) : null;
        const lon = prop.longitude ? Number(prop.longitude) : null;
        const price = prop.price ? Number(prop.price) : 0;
        const baths = prop.bathrooms ? Number(prop.bathrooms) : 0;
        const dateSoldStr = prop.dateSold ? (prop.dateSold instanceof Date ? prop.dateSold.toISOString().split('T')[0] : prop.dateSold) : null;

        const txs = transactionsByPropertyId.get(prop.id) ?? [];
        const { buyerPurchasePrice, buyerPurchaseDate, sellerPurchasePrice, sellerPurchaseDate, spread, latestArmsLengthTx } = calculateSpread(txs);
        const latest = latestArmsLengthTx;

        // Fallback buyer/seller names from most recent Arms Length transaction when company is null
        const buyerDisplayName = prop.buyerCompanyName || (latest?.buyerName ?? null);
        const sellerDisplayName = prop.sellerCompanyName || (latest?.sellerName ?? null);

        // DB column is the authoritative manual override; fall back to transaction lender check
        const isFinancedByARV = prop.isArvFunded ?? (latest?.firstMtgLenderName?.trim().toUpperCase() === "ARV FINANCE INC");

        // Fallback contact info from transaction-linked company when property has no buyerId/sellerId
        const txBuyerCompany = !prop.buyerId && latest?.buyerId ? txFallbackCompanyMap.get(latest.buyerId) ?? null : null;
        const txSellerCompany = !prop.sellerId && latest?.sellerId ? txFallbackCompanyMap.get(latest.sellerId) ?? null : null;

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
            // Property fields
            propertyType: prop.propertyType || '',
            statuses: statusesByPropertyId.get(prop.id) ?? ['in-renovation'],
            status: statusesByPropertyId.get(prop.id)?.[0] ?? 'in-renovation',
            // Price and date
            price: price,
            dateSold: dateSoldStr,
            // Company info (buyer as primary, seller as fallback - companyId for frontend filter/display)
            companyId: prop.buyerId ? String(prop.buyerId) : (prop.sellerId ? String(prop.sellerId) : null),
            buyerId: prop.buyerId ? String(prop.buyerId) : null,
            sellerId: prop.sellerId ? String(prop.sellerId) : null,
            buyerCompanyName: buyerDisplayName,
            buyerContactName: prop.buyerContactName || txBuyerCompany?.contactName || null,
            buyerContactEmail: prop.buyerContactEmail || txBuyerCompany?.contactEmail || null,
            buyerContactPhone: prop.buyerContactPhone || txBuyerCompany?.phoneNumber || null,
            sellerCompanyName: sellerDisplayName,
            sellerContactName: prop.sellerContactName || txSellerCompany?.contactName || null,
            sellerContactEmail: prop.sellerContactEmail || txSellerCompany?.contactEmail || null,
            sellerContactPhone: prop.sellerContactPhone || txSellerCompany?.phoneNumber || null,
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
            isFinancedByARV,
            sellerName: sellerDisplayName,
            // Legacy aliases for backward compatibility
            propertyOwner: prop.companyName || buyerDisplayName || sellerDisplayName || null,
            propertyOwnerId: prop.buyerId ? String(prop.buyerId) : (prop.sellerId ? String(prop.sellerId) : null),
            // Additional fields that might be expected by frontend but not directly in new schema
            purchasePrice: sellerPurchasePrice,
            saleValue: buyerPurchasePrice,
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
