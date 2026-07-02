import { db } from 'server/storage';
import type { PropertySuggestion } from '@shared/types/properties';
import {
    properties,
    addresses,
    structures,
    lastSales,
    propertyTransactions,
} from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { companies, companyContacts, companyMsas } from '@database/schemas/companies.schema';
import { msas } from '@database/schemas/msas.schema';
import {
    normalizeCountyName,
    trimCompanyName,
    normalizePropertyType,
    normalizeDateToYMD,
} from 'server/utils/normalization';
import {
    sortTransactionsDesc,
    calculateSpread,
    getAssignorFromTxs,
} from 'server/utils/orderTransactions';
import { ARV_LENDER } from 'server/constants/transactions.constants';
import { isUniqueViolation } from 'server/utils/dbErrors';
import { insertPropertyRelatedData, SfrPropertyData } from 'server/utils/propertyDataHelpers';
import { addCountiesToCompanyIfNeeded } from 'server/utils/dataSyncHelpers';
import { eq, sql, or, and, desc, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { reprocessProperty, markTransactionAssignments } from './propertyTransactions.services';
import { formatContactName } from '@shared/utils/formatContactName';

// ─── Suggestions ─────────────────────────────────────────────────────────────

export async function getPropertySuggestions(
    search: string,
    county?: string,
): Promise<PropertySuggestion[]> {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    const conditions: SQL[] = [];

    const searchClause = or(
        sql`LOWER(TRIM(${addresses.formattedStreetAddress})) LIKE ${searchTerm}`,
        sql`LOWER(TRIM(${addresses.city})) LIKE ${searchTerm}`,
        sql`LOWER(TRIM(${addresses.state})) LIKE ${searchTerm}`,
        sql`LOWER(TRIM(${addresses.zipCode})) LIKE ${searchTerm}`,
    );
    if (searchClause) conditions.push(searchClause);

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        const countyClause = or(
            sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
            sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
        );
        if (countyClause) conditions.push(countyClause);
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const query = db
        .select({
            id: properties.id,
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipcode: addresses.zipCode,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId))
        .$dynamic();

    if (whereClause) {
        query.where(whereClause);
    }

    return query.limit(5);
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getPropertyById(id: string) {
    const [result] = await db
        .select({
            id: properties.id,
            sfrPropertyId: properties.sfrPropertyId,
            propertyClassDescription: properties.propertyClassDescription,
            propertyType: properties.propertyType,
            vacant: properties.vacant,
            hoa: properties.hoa,
            ownerType: properties.ownerType,
            purchaseMethod: properties.purchaseMethod,
            listingStatus: properties.listingStatus,
            monthsOwned: properties.monthsOwned,
            msa: properties.msa,
            county: properties.county,
            isArvFunded: properties.isArvFunded,
            createdAt: properties.createdAt,
            updatedAt: properties.updatedAt,
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipCode: addresses.zipCode,
            latitude: sql<number | null>`CAST(${addresses.latitude} AS FLOAT)`,
            longitude: sql<number | null>`CAST(${addresses.longitude} AS FLOAT)`,
            bedrooms: structures.bedsCount,
            bathrooms: sql<number | null>`CAST(${structures.baths} AS FLOAT)`,
            squareFeet: structures.livingAreaSqft,
            yearBuilt: structures.yearBuilt,
            price: sql<number | null>`CAST(${lastSales.price} AS FLOAT)`,
            dateSold: lastSales.recordingDate,
            lender: lastSales.lender,
        })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .where(eq(properties.id, id))
        .limit(1);

    if (!result) return null;

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
            sortOrder: propertyTransactions.sortOrder,
            isAssignment: propertyTransactions.isAssignment,
            assignorId: propertyTransactions.assignorId,
            assignorName: propertyTransactions.assignorName,
        })
        .from(propertyTransactions)
        .where(eq(propertyTransactions.propertyId, id))
        .orderBy(
            desc(propertyTransactions.recordingDate),
            desc(propertyTransactions.propertyTransactionsId),
        );

    const propertyStatusRows = await db
        .select({ statusName: statuses.name })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(eq(propertyStatuses.propertyId, id));
    const propertyStatusNames = propertyStatusRows.map((r) => r.statusName);

    const sortedTxs = sortTransactionsDesc(allTxs);
    const {
        buyerPurchasePrice,
        buyerPurchaseDate,
        sellerPurchasePrice,
        sellerPurchaseDate,
        spread,
        latestArmsLengthTx,
    } = calculateSpread(sortedTxs);
    const latest = latestArmsLengthTx;

    // TX data is the sole source of truth for buyer/seller
    const buyerDisplayName = latest?.buyerName ?? null;
    const sellerDisplayName = latest?.sellerName ?? null;
    const txBuyerId = latest?.buyerId ?? null;
    const txSellerId = latest?.sellerId ?? null;

    const { assignorName: rawAssignorName, assignorId: rawAssignorId } =
        getAssignorFromTxs(allTxs);

    let assignorContactName: string | null = null;
    let assignorContactEmail: string | null = null;
    let assignorContactPhone: string | null = null;
    if (rawAssignorId) {
        const [assignorContact] = await db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.companyId, rawAssignorId))
            .orderBy(companyContacts.sortOrder, companyContacts.id)
            .limit(1);
        if (assignorContact) {
            assignorContactName = formatContactName(
                [assignorContact.firstName, assignorContact.lastName].filter(Boolean).join(' '),
            );
            assignorContactEmail = assignorContact.email ?? null;
            assignorContactPhone = assignorContact.phoneNumber ?? null;
        }
    }

    // Batch-fetch contacts for the TX buyer/seller companies (primary) plus any
    // property-join company IDs that differ (as fallback).
    const txCompanyIds = [txBuyerId, txSellerId].filter(Boolean) as string[];
    type TxCompany = {
        id: string;
        contactName: string | null;
        contactEmail: string | null;
        phoneNumber: string | null;
    };
    const txCompanyMap = new Map<string, TxCompany>();
    if (txCompanyIds.length > 0) {
        const contactRows = await db
            .select()
            .from(companyContacts)
            .where(inArray(companyContacts.companyId, txCompanyIds))
            .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
        const primaryContactByCompanyId = new Map<string, typeof companyContacts.$inferSelect>();
        for (const row of contactRows) {
            if (!primaryContactByCompanyId.has(row.companyId))
                primaryContactByCompanyId.set(row.companyId, row);
        }
        for (const id of txCompanyIds) {
            const primary = primaryContactByCompanyId.get(id);
            txCompanyMap.set(id, {
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
    const txBuyerCompany = txBuyerId ? (txCompanyMap.get(txBuyerId) ?? null) : null;
    const txSellerCompany = txSellerId ? (txCompanyMap.get(txSellerId) ?? null) : null;

    // DB column is the authoritative manual override; fall back to transaction lender check
    const isFinancedByARV =
        result.isArvFunded || latest?.firstMtgLenderName?.trim().toUpperCase() === ARV_LENDER;

    const lat = result.latitude ? Number(result.latitude) : null;
    const lon = result.longitude ? Number(result.longitude) : null;
    const baths = result.bathrooms ? Number(result.bathrooms) : null;

    // Price and date from most recent AL tx; fall back to lastSales
    const txSalePrice = latest?.salePrice != null ? parseFloat(String(latest.salePrice)) : null;
    const price =
        txSalePrice !== null && !isNaN(txSalePrice)
            ? txSalePrice
            : result.price
              ? Number(result.price)
              : 0;
    const txDate = latest?.recordingDate
        ? typeof latest.recordingDate === 'string'
            ? latest.recordingDate.split('T')[0]
            : (latest.recordingDate as Date).toISOString().split('T')[0]
        : null;
    const dateSoldStr =
        txDate ??
        (result.dateSold
            ? typeof result.dateSold === 'object' &&
              result.dateSold !== null &&
              'toISOString' in result.dateSold
                ? (result.dateSold as Date).toISOString().split('T')[0]
                : String(result.dateSold).split('T')[0]
            : null);

    const resolvedBuyerId = txBuyerId;
    const resolvedSellerId = txSellerId;

    return {
        id: String(result.id),
        sfrPropertyId: result.sfrPropertyId ?? null,
        address: result.address || '',
        city: result.city || '',
        state: result.state || '',
        zipCode: result.zipCode || '',
        latitude: lat,
        longitude: lon,
        bedrooms: result.bedrooms ? Number(result.bedrooms) : 0,
        bathrooms: baths || 0,
        squareFeet: result.squareFeet ? Number(result.squareFeet) : 0,
        yearBuilt: result.yearBuilt ? Number(result.yearBuilt) : null,
        propertyType: result.propertyType || '',
        statuses: propertyStatusNames.length > 0 ? propertyStatusNames : ['in-renovation'],
        status: propertyStatusNames[0] ?? 'in-renovation',
        price,
        dateSold: dateSoldStr,
        buyerId: resolvedBuyerId,
        buyerCompanyName: buyerDisplayName,
        buyerContactName: txBuyerCompany?.contactName ?? null,
        buyerContactEmail: txBuyerCompany?.contactEmail ?? null,
        buyerContactPhone: txBuyerCompany?.phoneNumber ?? null,
        sellerId: resolvedSellerId,
        sellerCompanyName: sellerDisplayName,
        sellerName: sellerDisplayName,
        sellerContactName: txSellerCompany?.contactName ?? null,
        sellerContactEmail: txSellerCompany?.contactEmail ?? null,
        sellerContactPhone: txSellerCompany?.phoneNumber ?? null,
        assignorId: rawAssignorId ?? null,
        assignorCompanyName: rawAssignorName ?? null,
        assignorContactName,
        assignorContactEmail,
        assignorContactPhone,
        buyerPurchasePrice,
        buyerPurchaseDate,
        sellerPurchasePrice,
        sellerPurchaseDate,
        spread,
        isFinancedByARV,
        lenderName: latest?.firstMtgLenderName ?? result.lender ?? null,
        companyId: resolvedBuyerId || resolvedSellerId || null,
        companyName: buyerDisplayName || sellerDisplayName || null,
        companyContactName: txBuyerCompany?.contactName || txSellerCompany?.contactName || null,
        companyContactEmail: txBuyerCompany?.contactEmail || txSellerCompany?.contactEmail || null,
        companyContactPhone: txBuyerCompany?.phoneNumber || txSellerCompany?.phoneNumber || null,
        propertyOwner: buyerDisplayName || sellerDisplayName || null,
        propertyOwnerId: resolvedBuyerId || resolvedSellerId || null,
        purchasePrice: sellerPurchasePrice ?? price,
        saleValue: buyerPurchasePrice ?? price,
    };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

interface DeletePropertyResult {
    id: string;
    sfrPropertyId: number | null;
}

export async function deleteProperty(id: string): Promise<DeletePropertyResult | null> {
    const deleted = await db.delete(properties).where(eq(properties.id, id)).returning();

    if (deleted.length === 0) return null;
    return { id: deleted[0].id, sfrPropertyId: deleted[0].sfrPropertyId };
}

// ─── Create / upsert ─────────────────────────────────────────────────────────

interface CreatePropertyInput {
    address: string;
    city: string;
    state: string;
    zipCode: string;
}

type CreatePropertyResult =
    | { status: 'created'; id: string; sfrPropertyId: number }
    | { status: 'updated'; id: string; sfrPropertyId: number }
    | { status: 'missing-config' }
    | { status: 'sfr-error'; httpStatus: number; error: string }
    | { status: 'not-found' };

export async function createProperty(input: CreatePropertyInput): Promise<CreatePropertyResult> {
    const { address, city, state, zipCode } = input;

    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;
    if (!API_KEY || !API_URL) return { status: 'missing-config' };

    const formattedAddress = `${address.toUpperCase()}, ${city.toUpperCase()}, ${state.toUpperCase()} ${zipCode}`;
    console.log(`Formatted address for SFR API: ${formattedAddress}`);

    const sfrApiUrl = `${API_URL}/properties/by-address?address=${encodeURIComponent(formattedAddress)}`;
    console.log(`Calling SFR API: ${sfrApiUrl}`);

    const sfrResponse = await fetch(sfrApiUrl, {
        method: 'GET',
        headers: {
            'X-API-TOKEN': API_KEY,
            Accept: 'application/json',
            'User-Agent': 'PostmanRuntime/7.41.0',
        },
    });

    if (!sfrResponse.ok) {
        const errorText = await sfrResponse.text();
        console.error(`SFR API error: ${sfrResponse.status} - ${errorText}`);
        return { status: 'sfr-error', httpStatus: sfrResponse.status, error: errorText };
    }

    const propertyData = await sfrResponse.json();
    console.log('SFR API response received');

    if (!propertyData?.property_id) return { status: 'not-found' };

    const sfrPropertyId = propertyData.property_id;
    const normalizedCounty = normalizeCountyName(propertyData.county);
    const buyerName: string | null =
        propertyData.current_sale?.buyer_1 || propertyData.currentSale?.buyer1 || null;
    const sellerName: string | null =
        propertyData.current_sale?.seller_1 || propertyData.currentSale?.seller1 || null;

    const allCompanies = await db.select().from(companies);
    const contactsMap = new Map<string, (typeof allCompanies)[0]>();
    for (const company of allCompanies) {
        const key = trimCompanyName(company.companyName);
        if (key) contactsMap.set(key, company);
    }

    const upsertCompany = async (
        companyName: string,
        county: string | null,
    ): Promise<string | null> => {
        const name = trimCompanyName(companyName);
        if (!name) return null;

        const existingCompany = contactsMap.get(name);
        if (existingCompany) {
            // County tracking now uses company_counties table; requires state info — handled by dedicated sync
            return existingCompany.id;
        }

        try {
            const [newCompany] = await db
                .insert(companies)
                .values({
                    companyName: name,
                    updatedAt: new Date(),
                })
                .returning();
            if (newCompany) contactsMap.set(name, newCompany);
            return newCompany?.id ?? null;
        } catch (companyError) {
            const isDuplicate =
                (companyError instanceof Error && companyError.message.includes('duplicate')) ||
                isUniqueViolation(companyError);
            if (!isDuplicate) {
                console.error('Error creating company:', companyError);
                return null;
            }
            try {
                const [duplicateCompany] = await db
                    .select()
                    .from(companies)
                    .where(eq(companies.companyName, name))
                    .limit(1);
                if (duplicateCompany) {
                    contactsMap.set(name, duplicateCompany);
                    return duplicateCompany.id;
                }
            } catch {}
            return null;
        }
    };

    let buyerId: string | null = null;
    let sellerId: string | null = null;
    if (buyerName) buyerId = await upsertCompany(buyerName, normalizedCounty);
    if (sellerName) sellerId = await upsertCompany(sellerName, normalizedCounty);

    const maybeInsertAcquisitionTransaction = async (
        propertyId: string,
        txBuyerId: string | null,
        buyerNameVal: string | null,
    ) => {
        if (!txBuyerId || !buyerNameVal) return;
        const lastSale = propertyData?.last_sale || propertyData?.lastSale;
        if (!lastSale?.date) return;
        const normalizedDate = normalizeDateToYMD(lastSale.date);
        if (!normalizedDate) return;
        const normalizedBuyerName = trimCompanyName(buyerNameVal);
        const cs = propertyData?.current_sale || propertyData?.currentSale;
        const sellerNameVal: string | null = cs
            ? trimCompanyName(cs.seller_1 || cs.seller1) || null
            : null;
        const [existing] = await db
            .select({ propertyId: propertyTransactions.propertyId })
            .from(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.propertyId, propertyId),
                    eq(propertyTransactions.buyerId, txBuyerId),
                    eq(propertyTransactions.recordingDate, normalizedDate),
                    eq(propertyTransactions.transactionType, 'acquisition'),
                ),
            )
            .limit(1);
        if (existing) return;
        await db.insert(propertyTransactions).values({
            propertyId,
            buyerId: txBuyerId,
            sellerId,
            transactionType: 'acquisition',
            saleDate: normalizedDate,
            recordingDate: normalizedDate,
            salePrice: lastSale.price != null ? String(lastSale.price) : null,
            firstMtgAmount: lastSale.mtg_amount != null ? String(lastSale.mtg_amount) : null,
            buyerName: normalizedBuyerName,
            sellerName: sellerNameVal,
        });
    };

    const propertyListingStatus = (propertyData.listing_status || '').trim().toLowerCase();
    const isOnMarket =
        propertyListingStatus === 'on market' || propertyListingStatus === 'on_market';
    const listingStatus = isOnMarket ? 'on-market' : 'off-market';

    const [existingProperty] = await db
        .select()
        .from(properties)
        .where(eq(properties.sfrPropertyId, Number(sfrPropertyId)))
        .limit(1);

    if (existingProperty) {
        await db
            .update(properties)
            .set({
                propertyClassDescription: propertyData.property_class_description || null,
                propertyType: normalizePropertyType(propertyData.property_type) || null,
                vacant: propertyData.vacant || null,
                hoa: propertyData.hoa || null,
                ownerType: propertyData.owner_type || null,
                purchaseMethod: propertyData.purchase_method || null,
                listingStatus,
                monthsOwned: propertyData.months_owned || null,
                msa: propertyData.msa || null,
                county: normalizedCounty,
                updatedAt: sql`now()`,
            })
            .where(eq(properties.id, existingProperty.id));

        await maybeInsertAcquisitionTransaction(existingProperty.id, buyerId, buyerName);
        console.log(`Property updated: ${sfrPropertyId}`);
        return { status: 'updated', id: existingProperty.id, sfrPropertyId: Number(sfrPropertyId) };
    }

    const [newProperty] = await db
        .insert(properties)
        .values({
            sfrPropertyId: Number(sfrPropertyId),
            propertyClassDescription: propertyData.property_class_description || null,
            propertyType: normalizePropertyType(propertyData.property_type) || null,
            vacant: propertyData.vacant || null,
            hoa: propertyData.hoa || null,
            ownerType: propertyData.owner_type || null,
            purchaseMethod: propertyData.purchase_method || null,
            listingStatus,
            monthsOwned: propertyData.months_owned || null,
            msa: propertyData.msa || null,
            county: normalizedCounty,
        })
        .returning();

    await insertPropertyRelatedData(
        newProperty.id,
        propertyData as SfrPropertyData,
        normalizedCounty,
    );
    await maybeInsertAcquisitionTransaction(newProperty.id, buyerId, buyerName);
    console.log(`Property created: ${sfrPropertyId} (ID: ${newProperty.id})`);
    return { status: 'created', id: newProperty.id, sfrPropertyId: Number(sfrPropertyId) };
}

// ─── Lightweight structural lookup (no DB writes) ──────────────────────────────

interface LookupPropertyInput {
    address: string;
    city: string;
    state: string;
    zipCode: string;
}

type LookupPropertyResult =
    | {
          status: 'found';
          sfrPropertyId: number;
          beds: number | null;
          baths: number | null;
          sqft: number | null;
          propertyType: string | null;
      }
    | { status: 'not-found' }
    | { status: 'missing-config' }
    | { status: 'sfr-error'; httpStatus: number; error: string };

// Fetches a property's structural details from SFR by address without touching the database.
// Used by the deal form to auto-fill beds/baths/sqft/property type for a disclosed address.
export async function lookupPropertyByAddress(
    input: LookupPropertyInput,
): Promise<LookupPropertyResult> {
    const { address, city, state, zipCode } = input;

    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;
    if (!API_KEY || !API_URL) return { status: 'missing-config' };

    const formattedAddress = `${address.toUpperCase()}, ${city.toUpperCase()}, ${state.toUpperCase()} ${zipCode}`;
    const sfrApiUrl = `${API_URL}/properties/by-address?address=${encodeURIComponent(formattedAddress)}`;

    const sfrResponse = await fetch(sfrApiUrl, {
        method: 'GET',
        headers: {
            'X-API-TOKEN': API_KEY,
            Accept: 'application/json',
            'User-Agent': 'PostmanRuntime/7.41.0',
        },
    });

    if (!sfrResponse.ok) {
        const errorText = await sfrResponse.text();
        console.error(
            `[lookupPropertyByAddress] SFR API error: ${sfrResponse.status} - ${errorText}`,
        );
        return { status: 'sfr-error', httpStatus: sfrResponse.status, error: errorText };
    }

    let propertyData: SfrPropertyData;
    try {
        propertyData = (await sfrResponse.json()) as SfrPropertyData;
    } catch {
        console.error('[lookupPropertyByAddress] SFR API returned a non-JSON body');
        return { status: 'sfr-error', httpStatus: sfrResponse.status, error: 'Malformed response' };
    }
    if (!propertyData?.property_id) return { status: 'not-found' };

    const struct = propertyData.structure;
    const baths =
        struct?.baths != null
            ? Number(struct.baths) + (struct.partial_baths_count ?? 0) * 0.5
            : null;

    return {
        status: 'found',
        sfrPropertyId: Number(propertyData.property_id),
        beds: struct?.beds_count ?? null,
        baths: Number.isFinite(baths) ? baths : null,
        sqft: struct?.living_area_sqft ?? struct?.total_area_sq_ft ?? null,
        propertyType: normalizePropertyType(propertyData.property_type),
    };
}

// ─── Patch ────────────────────────────────────────────────────────────────────

async function upsertCompanyByName(
    companyName: string,
    propertyCounty: string | null,
    propertyMsa: string | null,
): Promise<string | null> {
    const name = trimCompanyName(companyName);
    if (!name) return null;

    // Search globally (no county/MSA filter) to avoid creating duplicates
    const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.companyName, name))
        .limit(1);

    let companyId: string;

    if (existing) {
        companyId = existing.id;
    } else {
        const inserted = await db
            .insert(companies)
            .values({ companyName: name, updatedAt: new Date() })
            .onConflictDoNothing({ target: companies.companyName })
            .returning({ id: companies.id });

        if (inserted.length > 0) {
            companyId = inserted[0].id;
        } else {
            // Race condition — re-fetch
            const [refetched] = await db
                .select({ id: companies.id })
                .from(companies)
                .where(eq(companies.companyName, name))
                .limit(1);
            if (!refetched) return null;
            companyId = refetched.id;
        }
    }

    // Add county association if property has a known county
    if (propertyCounty) {
        await addCountiesToCompanyIfNeeded({ id: companyId }, [propertyCounty]);
    }

    // Add MSA association if property has an MSA
    if (propertyMsa) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, propertyMsa))
            .limit(1);
        if (msaRow) {
            await db
                .insert(companyMsas)
                .values({ companyId, msaId: msaRow.id })
                .onConflictDoNothing();
        }
    }

    return companyId;
}

interface PatchPropertyResult {
    id: string;
    isArvFunded: boolean;
    statuses: string[];
}

export async function patchProperty(
    id: string,
    data: {
        isArvFunded?: boolean;
        statuses?: string[];
        buyerCompanyName?: string;
        sellerCompanyName?: string;
        deletedTransactionIds?: number[];
        assignments?: Array<{
            transactionId: number;
            isAssignment: boolean;
            assignorName?: string | null;
        }>;
    },
): Promise<PatchPropertyResult | null> {
    const [existing] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);

    if (!existing) return null;

    if (data.isArvFunded !== undefined) {
        await db
            .update(properties)
            .set({ isArvFunded: data.isArvFunded, updatedAt: new Date() })
            .where(eq(properties.id, id));
    }

    if (data.statuses !== undefined && data.statuses.length > 0) {
        const statusRows = await db
            .select({ id: statuses.id, name: statuses.name })
            .from(statuses)
            .where(inArray(statuses.name, data.statuses));

        await db.delete(propertyStatuses).where(eq(propertyStatuses.propertyId, id));

        if (statusRows.length > 0) {
            await db
                .insert(propertyStatuses)
                .values(statusRows.map((s) => ({ propertyId: id, statusId: s.id })));
        }
    }

    if (data.deletedTransactionIds !== undefined && data.deletedTransactionIds.length > 0) {
        await db
            .delete(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.propertyId, id),
                    inArray(
                        propertyTransactions.propertyTransactionsId,
                        data.deletedTransactionIds,
                    ),
                    eq(propertyTransactions.userCreated, true),
                ),
            );
        await reprocessProperty(id);
    }

    // Assignment marking is display-only metadata on the sale row — it doesn't affect
    // status/ARV-funded derivation, so no reprocess is needed.
    if (data.assignments !== undefined && data.assignments.length > 0) {
        await markTransactionAssignments(
            id,
            data.assignments.map((a) => ({
                transactionId: a.transactionId,
                isAssignment: a.isAssignment,
                assignorName: a.assignorName ?? null,
            })),
        );
    }

    const [updated] = await db
        .select({ id: properties.id, isArvFunded: properties.isArvFunded })
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);

    const currentStatuses = await db
        .select({ name: statuses.name })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(eq(propertyStatuses.propertyId, id));

    return {
        id: updated.id,
        isArvFunded: updated.isArvFunded,
        statuses: currentStatuses.map((r) => r.name),
    };
}
