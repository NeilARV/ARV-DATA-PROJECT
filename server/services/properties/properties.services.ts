import { db } from 'server/storage';
import {
    properties,
    addresses,
    structures,
    lastSales,
    propertyTransactions,
    supplementalTaxBills,
} from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { companyContacts } from '@database/schemas/companies.schema';
import { trimCompanyName } from 'server/utils/normalization';
import { calculateSpread } from 'server/utils/orderTransactions';
import { ARV_LENDER } from 'server/constants/transactions.constants';
import { eq, sql, or, and, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { resolveDateRange } from 'server/utils/resolveDateRange';
import { formatContactName } from '@shared/utils/formatContactName';

interface GetPropertiesFilters {
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
    companyId?: string; // Company ID filter - matches via property_transactions
    hasDateSold?: string;
    dateRange?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    search?: string; // Full-text search across address, city, state, zip
    skipCount?: string; // When "true" on page > 1, skips the COUNT query — client uses cached total
    companyRole?: string; // 'buyer' | 'seller' — restricts companyId match to one transaction role
}

interface GetPropertiesResult {
    properties: any[];
    total: number | null; // null when skipCount=true; client uses its cached stablePropertyCount
    hasMore: boolean;
    page: number;
    limit: number;
}

interface GetPropertiesOptions {
    /** Resolved by the controller from the requester's role (admin/owner only) — never from
     *  query params, so clients can't opt themselves in. */
    includeSupplementalTax?: boolean;
}

/**
 * Signed supplemental-tax total per transaction: bills are stored as positive magnitudes with
 * the direction in bill_type, and a Jan–May event has two fiscal-year rows — so sum the signed
 * amounts (refund = +, bill = −) to get one display value per triggering transaction.
 */
export async function getSupplementalTaxTotalsByTxId(
    txIds: number[],
): Promise<Map<number, number>> {
    const totals = new Map<number, number>();
    if (txIds.length === 0) return totals;
    const rows = await db
        .select({
            propertyTransactionId: supplementalTaxBills.propertyTransactionId,
            billType: supplementalTaxBills.billType,
            amount: supplementalTaxBills.amount,
        })
        .from(supplementalTaxBills)
        .where(inArray(supplementalTaxBills.propertyTransactionId, txIds));
    for (const row of rows) {
        const signed = (row.billType === 'refund' ? 1 : -1) * Number(row.amount);
        totals.set(
            row.propertyTransactionId,
            (totals.get(row.propertyTransactionId) ?? 0) + signed,
        );
    }
    return totals;
}

// Txs are already ordered by COALESCE(sort_order, 999999) ASC (most recent first).
function detectAssignorFromSortedTxs(
    txs: Array<{
        transactionType: string | null;
        buyerId: string | null;
        sellerName: string | null;
        sellerId: string | null;
    }>,
): { assignorId: string | null; assignorCompanyName: string | null } {
    const latestAL = txs.find(
        (tx) => (tx.transactionType ?? '').trim().toLowerCase() === 'arms length',
    );
    if (!latestAL?.buyerId) return { assignorId: null, assignorCompanyName: null };

    const assignmentTx = txs.find(
        (tx) =>
            (tx.transactionType ?? '').trim().toLowerCase() === 'assignment' &&
            tx.buyerId === latestAL.buyerId,
    );
    return {
        assignorId: assignmentTx?.sellerId ?? null,
        assignorCompanyName: assignmentTx?.sellerName ?? null,
    };
}

/**
 * Returns the transaction to use for display (buyer name, seller name, price, date).
 *
 * Company selected → most recent AL or Assignment tx where company is buyer or seller.
 *   Exception: if the match is an Assignment tx where the company is the SELLER (assigner),
 *   fall back to the most recent Arms Length tx. The assigner role is already surfaced via
 *   assignorId/assignorCompanyName; the display tx should show the actual sale.
 * No company → most recent Arms Length tx.
 *
 * Txs must be ordered COALESCE(sort_order, 999999) ASC so the first match is most recent.
 */
function findDisplayTx<
    T extends {
        transactionType: string | null;
        buyerId: string | null;
        sellerId: string | null;
    },
>(txs: T[], companyId: string | null): T | null {
    const latestAL =
        txs.find((tx) => (tx.transactionType ?? '').trim().toLowerCase() === 'arms length') ?? null;

    if (!companyId) return latestAL;

    const companyTx =
        txs.find((tx) => {
            const type = (tx.transactionType ?? '').trim().toLowerCase();
            return (
                (type === 'arms length' || type === 'assignment') &&
                (tx.buyerId === companyId || tx.sellerId === companyId)
            );
        }) ?? null;

    if (!companyTx) return latestAL;

    // If the company's involvement is as the assigner (seller in an Assignment tx),
    // show the Arms Length tx instead — the assigner role appears separately on the card.
    const isAssigner =
        (companyTx.transactionType ?? '').trim().toLowerCase() === 'assignment' &&
        companyTx.sellerId === companyId;

    return isAssigner ? latestAL : companyTx;
}

export async function getProperties(
    filters: GetPropertiesFilters,
    { includeSupplementalTax = false }: GetPropertiesOptions = {},
): Promise<GetPropertiesResult> {
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
        dateRange,
        page,
        limit,
        sortBy,
        search,
        skipCount,
        companyRole,
    } = filters;

    const pageNum = page ? Math.max(1, parseInt(page.toString(), 10)) : 1;
    const limitNum = limit ? Math.max(1, parseInt(limit.toString(), 10)) : 10;
    const offset = (pageNum - 1) * limitNum;

    // Pre-aggregate the most recent Arms Length tx per property once.
    // Replaces all per-row correlated subqueries for ORDER BY and date-range WHERE.
    //   maxRecordingDate  → used for date-range filtering (matches existing MAX() behavior)
    //   recentRecordingDate → recording_date of the tx with the lowest sort_order (most recent)
    //   recentSalePrice   → sale_price of the same tx, cast to REAL
    const alSummary = db
        .select({
            propertyId: propertyTransactions.propertyId,
            maxRecordingDate: sql<string | null>`MAX(${propertyTransactions.recordingDate})`.as(
                'max_recording_date',
            ),
            recentRecordingDate: sql<
                string | null
            >`(array_agg(${propertyTransactions.recordingDate} ORDER BY COALESCE(${propertyTransactions.sortOrder}, 999999) ASC))[1]`.as(
                'recent_recording_date',
            ),
            recentSalePrice: sql<
                number | null
            >`(array_agg(CAST(${propertyTransactions.salePrice} AS REAL) ORDER BY COALESCE(${propertyTransactions.sortOrder}, 999999) ASC))[1]`.as(
                'recent_sale_price',
            ),
        })
        .from(propertyTransactions)
        .where(sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`)
        .groupBy(propertyTransactions.propertyId)
        .as('al_summary');

    const conditions: SQL[] = [];

    // Full-text search across address, city, state, zip
    if (search && search.trim().length > 0) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        const searchClause = or(
            sql`LOWER(TRIM(${addresses.formattedStreetAddress})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.city})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.state})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.zipCode})) LIKE ${searchTerm}`,
        );
        if (searchClause) conditions.push(searchClause);
    }

    const companyIdTrimmed = companyId && typeof companyId === 'string' ? companyId.trim() : '';
    const hasCompanyFilter = companyIdTrimmed !== '';

    // Company ID filter: match properties where company appears in any Arms Length or Assignment
    // transaction. companyRole restricts to buyer-only or seller-only when set.
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

    // Status filter and optional name-based company filter.
    const statusesToUse = Array.isArray(status) ? status : status ? [status] : [];
    if (statusesToUse.length > 0) {
        const normalizedStatuses = statusesToUse.map((s) => s.toString().trim().toLowerCase());
        if (!hasCompanyFilter) {
            const ownerFilter = company || propertyOwner;
            if (ownerFilter) {
                const searchTerm = trimCompanyName(ownerFilter.toString())?.toLowerCase();
                if (searchTerm) {
                    conditions.push(
                        sql`EXISTS (
                            SELECT 1 FROM property_transactions pt
                            WHERE pt.property_id = ${properties.id}
                            AND (LOWER(TRIM(pt.buyer_name)) = ${searchTerm} OR LOWER(TRIM(pt.seller_name)) = ${searchTerm})
                        )`,
                    );
                }
            }
        }
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_statuses ps
                JOIN statuses s ON s.id = ps.status_id
                WHERE ps.property_id = ${properties.id}
                AND LOWER(s.name) = ANY(ARRAY[${sql.join(
                    normalizedStatuses.map((s) => sql`${s}`),
                    sql`, `,
                )}])
            )`,
        );
    }

    // Property Type filter
    if (propertyType) {
        const typeArray = Array.isArray(propertyType) ? propertyType : [propertyType];
        if (typeArray.length > 0) {
            const normalizedTypes = typeArray.map((t) => t.toString().trim().toLowerCase());
            if (normalizedTypes.length === 1) {
                conditions.push(
                    sql`LOWER(TRIM(${properties.propertyType})) = ${normalizedTypes[0]}`,
                );
            } else {
                const typeClause = or(
                    ...normalizedTypes.map(
                        (t) => sql`LOWER(TRIM(${properties.propertyType})) = ${t}`,
                    ),
                );
                if (typeClause) conditions.push(typeClause);
            }
        }
    }

    // Bathrooms filter - from structures table
    if (bathrooms) {
        const bathroomsStr = bathrooms.toString().trim().toLowerCase();
        if (bathroomsStr !== 'any') {
            const bathroomsNum = parseFloat(bathroomsStr);
            if (!isNaN(bathroomsNum)) {
                conditions.push(sql`CAST(${structures.baths} AS REAL) >= ${bathroomsNum}`);
            }
        }
    }

    // Bedrooms filter - from structures table
    if (bedrooms) {
        const bedroomsStr = bedrooms.toString().trim().toLowerCase();
        if (bedroomsStr !== 'any') {
            const bedroomsNum = parseInt(bedroomsStr, 10);
            if (!isNaN(bedroomsNum)) {
                conditions.push(sql`${structures.bedsCount} >= ${bedroomsNum}`);
            }
        }
    }

    // Price filter - still from lastSales table
    if (minPrice) {
        const minPriceNum = parseFloat(minPrice.toString());
        if (!isNaN(minPriceNum)) {
            conditions.push(sql`CAST(${lastSales.price} AS REAL) >= ${minPriceNum}`);
        }
    }

    if (maxPrice) {
        const maxPriceNum = parseFloat(maxPrice.toString());
        if (!isNaN(maxPriceNum)) {
            conditions.push(sql`CAST(${lastSales.price} AS REAL) <= ${maxPriceNum}`);
        }
    }

    // County filter
    if (county) {
        const normalizedCounty = county.toString().trim().toLowerCase();
        const countyClause = or(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
            sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
        );
        if (countyClause) conditions.push(countyClause);
    }

    // Zipcode filter
    if (zipcode) {
        conditions.push(sql`TRIM(${addresses.zipCode}) = ${zipcode.toString().trim()}`);
    }

    // City filter
    if (city) {
        conditions.push(
            sql`LOWER(TRIM(${addresses.city})) = ${city.toString().trim().toLowerCase()}`,
        );
    }

    // hasDateSold: property must have at least one Arms Length tx with a recording date
    if (hasDateSold === 'true') {
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM property_transactions pt
                WHERE pt.property_id = ${properties.id}
                AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
                AND pt.recording_date IS NOT NULL
            )`,
        );
    }

    // Date range: filter by most recent Arms Length recording_date via alSummary join.
    // Skipped when a company is selected — show all transactions regardless of date.
    const resolvedDateRange =
        dateRange && !hasCompanyFilter ? (resolveDateRange(dateRange) ?? null) : null;
    if (resolvedDateRange) {
        conditions.push(sql`${alSummary.maxRecordingDate} >= ${resolvedDateRange.dateMin}::date`);
        conditions.push(sql`${alSummary.maxRecordingDate} <= ${resolvedDateRange.dateMax}::date`);
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Skip COUNT on pages after the first — the client caches the total from page 1.
    let total: number | null = null;
    if (skipCount !== 'true' || pageNum === 1) {
        let countQuery = db
            .select({ count: sql<number>`count(DISTINCT ${properties.id})` })
            .from(properties)
            .$dynamic();
        countQuery = countQuery.leftJoin(addresses, eq(properties.id, addresses.propertyId));
        if (bedrooms || bathrooms) {
            countQuery = countQuery.leftJoin(structures, eq(properties.id, structures.propertyId));
        }
        if (minPrice || maxPrice) {
            countQuery = countQuery.leftJoin(lastSales, eq(properties.id, lastSales.propertyId));
        }
        // alSummary join required when date range conditions reference it
        if (resolvedDateRange) {
            countQuery = countQuery.leftJoin(alSummary, eq(properties.id, alSummary.propertyId));
        }
        if (whereClause) {
            countQuery = countQuery.where(whereClause);
        }
        const [totalResult] = await countQuery.execute();
        total = Number(totalResult?.count || 0);
    }

    // Step 1: Get the ordered page of property IDs.
    // alSummary is joined once; its columns drive ORDER BY instead of per-row correlated subqueries.
    let idQuery = db
        .select({ id: properties.id })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(alSummary, eq(properties.id, alSummary.propertyId))
        .$dynamic();

    if (whereClause) {
        idQuery = idQuery.where(whereClause);
    }

    const sortByValue = sortBy?.toString() || 'recently-sold';
    switch (sortByValue) {
        case 'recently-sold':
        default:
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${alSummary.recentRecordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`${alSummary.recentRecordingDate} DESC`,
                properties.id,
            );
            break;
        case 'days-held':
            idQuery = idQuery.orderBy(
                sql`CASE WHEN ${alSummary.recentRecordingDate} IS NULL THEN 1 ELSE 0 END`,
                sql`${alSummary.recentRecordingDate} ASC`,
                properties.id,
            );
            break;
        case 'price-high-low':
            idQuery = idQuery.orderBy(
                sql`CASE WHEN COALESCE(${alSummary.recentSalePrice}, CAST(${lastSales.price} AS REAL)) IS NULL THEN 1 ELSE 0 END`,
                sql`COALESCE(${alSummary.recentSalePrice}, CAST(${lastSales.price} AS REAL)) DESC`,
                properties.id,
            );
            break;
        case 'price-low-high':
            idQuery = idQuery.orderBy(
                sql`CASE WHEN COALESCE(${alSummary.recentSalePrice}, CAST(${lastSales.price} AS REAL)) IS NULL THEN 1 ELSE 0 END`,
                sql`COALESCE(${alSummary.recentSalePrice}, CAST(${lastSales.price} AS REAL)) ASC`,
                properties.id,
            );
            break;
    }

    const idRows = await idQuery
        .limit(limitNum + 1)
        .offset(offset)
        .execute();
    const pageIds = idRows.map((r: { id: string }) => r.id);
    const hasMore = pageIds.length > limitNum;
    const idsForPage = hasMore ? pageIds.slice(0, limitNum) : pageIds;

    if (idsForPage.length === 0) {
        return {
            properties: [],
            total: total ?? 0,
            hasMore: false,
            page: pageNum,
            limit: limitNum,
        };
    }

    // Fetch statuses for this page
    const propertyStatusRows = await db
        .select({ propertyId: propertyStatuses.propertyId, statusName: statuses.name })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(inArray(propertyStatuses.propertyId, idsForPage));
    const statusesByPropertyId = new Map<string, string[]>();
    for (const row of propertyStatusRows) {
        const list = statusesByPropertyId.get(row.propertyId) ?? [];
        list.push(row.statusName);
        statusesByPropertyId.set(row.propertyId, list);
    }

    // Step 2: Fetch full rows for this page — no company joins; tx data drives buyer/seller/price/date
    let query = db
        .select({
            id: properties.id,
            propertyType: properties.propertyType,
            msa: properties.msa,
            county: sql<string>`COALESCE(${properties.county}, ${addresses.county})`,
            createdAt: properties.createdAt,
            updatedAt: properties.updatedAt,
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipCode: addresses.zipCode,
            latitude: sql<number | null>`CAST(${addresses.latitude} AS REAL)`,
            longitude: sql<number | null>`CAST(${addresses.longitude} AS REAL)`,
            bedrooms: structures.bedsCount,
            bathrooms: sql<number | null>`CAST(${structures.baths} AS REAL)`,
            squareFeet: structures.totalAreaSqFt,
            yearBuilt: structures.yearBuilt,
            // lastSales values used as fallback when no AL transaction exists
            lastSalePrice: sql<number | null>`CAST(${lastSales.price} AS REAL)`,
            lastSaleDate: lastSales.recordingDate,
            lastSaleLender: lastSales.lender,
            isArvFunded: properties.isArvFunded,
        })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .where(inArray(properties.id, idsForPage));

    const idToIndex = new Map(idsForPage.map((id, i) => [id, i]));
    const results = (await query.execute()).sort(
        (a, b) => (idToIndex.get(a.id) ?? 0) - (idToIndex.get(b.id) ?? 0),
    );
    const rawPropertiesList = results;

    // Fetch ALL transactions for this page ordered most-recent-first
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
            sortOrder: propertyTransactions.sortOrder,
            firstMtgLenderName: propertyTransactions.firstMtgLenderName,
        })
        .from(propertyTransactions)
        .where(inArray(propertyTransactions.propertyId, idsForPage))
        .orderBy(
            propertyTransactions.propertyId,
            sql`COALESCE(${propertyTransactions.sortOrder}, 999999) ASC`,
        );

    type TxRow = (typeof allTxs)[number];
    const transactionsByPropertyId = new Map<string, TxRow[]>();
    for (const row of allTxs) {
        const pid = row.propertyId;
        const list = transactionsByPropertyId.get(pid) ?? [];
        list.push(row);
        transactionsByPropertyId.set(pid, list);
    }

    // Pre-pass: determine displayTx for each property and collect company IDs for contact lookup
    const displayTxByPropertyId = new Map<string, TxRow>();
    const displayTxCompanyIds = new Set<string>();

    for (const prop of rawPropertiesList) {
        const txs = transactionsByPropertyId.get(prop.id) ?? [];
        const displayTx = findDisplayTx(txs, companyIdTrimmed || null);
        if (displayTx) {
            displayTxByPropertyId.set(prop.id, displayTx);
            if (displayTx.buyerId) displayTxCompanyIds.add(displayTx.buyerId);
            if (displayTx.sellerId) displayTxCompanyIds.add(displayTx.sellerId);
        }
    }

    // Supplemental tax bills attach to the displayed sale (admin/owner-only field).
    const supplementalTaxByTxId = includeSupplementalTax
        ? await getSupplementalTaxTotalsByTxId(
              Array.from(displayTxByPropertyId.values()).map((tx) => tx.id),
          )
        : new Map<number, number>();

    type CompanyContact = {
        id: string;
        contactName: string | null;
        contactEmail: string | null;
        phoneNumber: string | null;
    };
    const displayTxCompanyMap = new Map<string, CompanyContact>();
    if (displayTxCompanyIds.size > 0) {
        const ids = Array.from(displayTxCompanyIds);
        const contactRows = await db
            .select()
            .from(companyContacts)
            .where(inArray(companyContacts.companyId, ids))
            .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
        const primaryByCompanyId = new Map<string, typeof companyContacts.$inferSelect>();
        for (const row of contactRows) {
            if (!primaryByCompanyId.has(row.companyId)) primaryByCompanyId.set(row.companyId, row);
        }
        for (const id of ids) {
            const primary = primaryByCompanyId.get(id);
            displayTxCompanyMap.set(id, {
                id,
                contactName: primary
                    ? formatContactName(
                          [primary.firstName, primary.lastName].filter(Boolean).join(' '),
                      )
                    : null,
                contactEmail: primary?.email ?? null,
                phoneNumber: primary?.phoneNumber ?? null,
            });
        }
    }

    // Pre-pass: collect assignor company IDs for contact info
    const assignorCompanyIds = new Set<string>();
    for (const prop of rawPropertiesList) {
        const txs = transactionsByPropertyId.get(prop.id) ?? [];
        const { assignorId } = detectAssignorFromSortedTxs(txs);
        if (assignorId) assignorCompanyIds.add(assignorId);
    }
    const assignorContactMap = new Map<string, CompanyContact>();
    if (assignorCompanyIds.size > 0) {
        const assignorIds = Array.from(assignorCompanyIds);
        const assignorContactRows = await db
            .select()
            .from(companyContacts)
            .where(inArray(companyContacts.companyId, assignorIds))
            .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
        const primaryByCompanyId = new Map<string, typeof companyContacts.$inferSelect>();
        for (const row of assignorContactRows) {
            if (!primaryByCompanyId.has(row.companyId)) primaryByCompanyId.set(row.companyId, row);
        }
        for (const id of assignorIds) {
            const primary = primaryByCompanyId.get(id);
            assignorContactMap.set(id, {
                id,
                contactName: primary
                    ? formatContactName(
                          [primary.firstName, primary.lastName].filter(Boolean).join(' '),
                      )
                    : null,
                contactEmail: primary?.email ?? null,
                phoneNumber: primary?.phoneNumber ?? null,
            });
        }
    }

    const propertiesList = rawPropertiesList.map((prop) => {
        const lat = prop.latitude ? Number(prop.latitude) : null;
        const lon = prop.longitude ? Number(prop.longitude) : null;
        const baths = prop.bathrooms ? Number(prop.bathrooms) : 0;

        const txs = transactionsByPropertyId.get(prop.id) ?? [];
        const {
            buyerPurchasePrice,
            buyerPurchaseDate,
            sellerPurchasePrice,
            sellerPurchaseDate,
            spread,
            latestArmsLengthTx,
        } = calculateSpread(txs);
        const { assignorId, assignorCompanyName } = detectAssignorFromSortedTxs(txs);
        const assignorContact = assignorId ? (assignorContactMap.get(assignorId) ?? null) : null;

        // displayTx is the source of truth for buyer/seller/price/date
        const displayTx = displayTxByPropertyId.get(prop.id) ?? null;
        const txBuyer = displayTx?.buyerId
            ? (displayTxCompanyMap.get(displayTx.buyerId) ?? null)
            : null;
        const txSeller = displayTx?.sellerId
            ? (displayTxCompanyMap.get(displayTx.sellerId) ?? null)
            : null;

        const buyerDisplayName = displayTx?.buyerName ?? null;
        const sellerDisplayName = displayTx?.sellerName ?? null;
        const txBuyerId = displayTx?.buyerId ?? null;
        const txSellerId = displayTx?.sellerId ?? null;

        const txSalePrice =
            displayTx?.salePrice != null ? parseFloat(String(displayTx.salePrice)) : null;
        const price =
            txSalePrice !== null && !isNaN(txSalePrice)
                ? txSalePrice
                : prop.lastSalePrice
                  ? Number(prop.lastSalePrice)
                  : 0;

        const txDate = displayTx?.recordingDate
            ? typeof displayTx.recordingDate === 'string'
                ? displayTx.recordingDate.split('T')[0]
                : (displayTx.recordingDate as Date).toISOString().split('T')[0]
            : null;
        const dateSoldStr = txDate ?? prop.lastSaleDate ?? null;

        const isFinancedByARV =
            prop.isArvFunded ||
            latestArmsLengthTx?.firstMtgLenderName?.trim().toUpperCase() === ARV_LENDER;

        return {
            id: prop.id,
            address: prop.address || '',
            city: prop.city || '',
            state: prop.state || '',
            zipCode: prop.zipCode || '',
            county: prop.county || '',
            latitude: lat,
            longitude: lon,
            bedrooms: prop.bedrooms ? Number(prop.bedrooms) : 0,
            bathrooms: baths,
            squareFeet: prop.squareFeet ? Number(prop.squareFeet) : 0,
            propertyType: prop.propertyType || '',
            statuses: statusesByPropertyId.get(prop.id) ?? ['in-renovation'],
            status: statusesByPropertyId.get(prop.id)?.[0] ?? 'in-renovation',
            price,
            dateSold: dateSoldStr,
            companyId: txBuyerId || txSellerId || null,
            buyerId: txBuyerId,
            sellerId: txSellerId,
            buyerCompanyName: buyerDisplayName,
            buyerContactName: txBuyer?.contactName ?? null,
            buyerContactEmail: txBuyer?.contactEmail ?? null,
            buyerContactPhone: txBuyer?.phoneNumber ?? null,
            sellerCompanyName: sellerDisplayName,
            sellerContactName: txSeller?.contactName ?? null,
            sellerContactEmail: txSeller?.contactEmail ?? null,
            sellerContactPhone: txSeller?.phoneNumber ?? null,
            companyName: buyerDisplayName || sellerDisplayName || null,
            companyContactName: txBuyer?.contactName ?? txSeller?.contactName ?? null,
            companyContactEmail: txBuyer?.contactEmail ?? txSeller?.contactEmail ?? null,
            companyContactPhone: txBuyer?.phoneNumber ?? txSeller?.phoneNumber ?? null,
            buyerPurchasePrice,
            buyerPurchaseDate,
            sellerPurchasePrice,
            sellerPurchaseDate,
            spread,
            assignorId: assignorId ?? null,
            assignorCompanyName: assignorCompanyName ?? null,
            assignorContactName: assignorContact?.contactName ?? null,
            assignorContactEmail: assignorContact?.contactEmail ?? null,
            assignorContactPhone: assignorContact?.phoneNumber ?? null,
            isFinancedByARV,
            supplementalTaxBill: displayTx
                ? (supplementalTaxByTxId.get(displayTx.id) ?? null)
                : null,
            lenderName: displayTx?.firstMtgLenderName ?? prop.lastSaleLender ?? null,
            sellerName: sellerDisplayName,
            propertyOwner: buyerDisplayName || sellerDisplayName || null,
            propertyOwnerId: txBuyerId || txSellerId || null,
            purchasePrice: sellerPurchasePrice,
            saleValue: buyerPurchasePrice,
            msa: prop.msa || null,
            createdAt: prop.createdAt,
            updatedAt: prop.updatedAt,
        };
    });

    console.log(
        `Properties: ${propertiesList.length} returned, ${total} total, hasMore: ${hasMore}, page: ${pageNum}`,
    );

    return {
        properties: propertiesList,
        total,
        hasMore,
        page: pageNum,
        limit: limitNum,
    };
}
