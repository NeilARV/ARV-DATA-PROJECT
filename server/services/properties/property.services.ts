import { db } from "server/storage";
import {
    properties,
    addresses,
    structures,
    lastSales,
    propertyTransactions,
} from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { companies, companyContacts, companyMsas } from "@database/schemas/companies.schema";
import { msas } from "@database/schemas/msas.schema";
import { normalizeCountyName, trimCompanyName, normalizePropertyType, normalizeDateToYMD } from "server/utils/normalization";
import { sortTransactionsDesc, calculateSpread } from "server/utils/orderTransactions";
import { insertPropertyRelatedData, SfrPropertyData } from "server/utils/propertyDataHelpers";
import { addCountiesToCompanyIfNeeded } from "server/utils/dataSyncHelpers";
import { eq, sql, or, and, desc, inArray } from "drizzle-orm";
import { appendPropertyTransactions, reprocessProperty } from "./propertyTransactions.services";
import { alias } from "drizzle-orm/pg-core";

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface PropertySuggestion {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
}

export async function getPropertySuggestions(search: string, county?: string): Promise<PropertySuggestion[]> {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    const conditions: any[] = [
        or(
            sql`LOWER(TRIM(${addresses.formattedStreetAddress})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.city})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.state})) LIKE ${searchTerm}`,
            sql`LOWER(TRIM(${addresses.zipCode})) LIKE ${searchTerm}`
        ),
    ];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            ) as any
        );
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    let query = db
        .select({
            id: properties.id,
            address: addresses.formattedStreetAddress,
            city: addresses.city,
            state: addresses.state,
            zipcode: addresses.zipCode,
        })
        .from(properties)
        .innerJoin(addresses, eq(properties.id, addresses.propertyId));

    if (whereClause) {
        query = query.where(whereClause) as any;
    }

    return query.limit(5);
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getPropertyById(id: string) {
    const buyerCompanies = alias(companies, "buyer_companies");
    const sellerCompanies = alias(companies, "seller_companies");

    const [result] = await db
        .select({
            id: properties.id,
            sfrPropertyId: properties.sfrPropertyId,
            buyerId: properties.buyerId,
            sellerId: properties.sellerId,
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
            buyerCompanyName: buyerCompanies.companyName,
            buyerContactName: sql<string | null>`(SELECT TRIM(cc.first_name || ' ' || COALESCE(cc.last_name, '')) FROM company_contacts cc WHERE cc.company_id = ${buyerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
            buyerContactEmail: sql<string | null>`(SELECT cc.email FROM company_contacts cc WHERE cc.company_id = ${buyerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
            buyerContactPhone: sql<string | null>`(SELECT cc.phone_number FROM company_contacts cc WHERE cc.company_id = ${buyerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
            sellerCompanyName: sellerCompanies.companyName,
            sellerContactName: sql<string | null>`(SELECT TRIM(cc.first_name || ' ' || COALESCE(cc.last_name, '')) FROM company_contacts cc WHERE cc.company_id = ${sellerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
            sellerContactEmail: sql<string | null>`(SELECT cc.email FROM company_contacts cc WHERE cc.company_id = ${sellerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
            sellerContactPhone: sql<string | null>`(SELECT cc.phone_number FROM company_contacts cc WHERE cc.company_id = ${sellerCompanies.id} ORDER BY cc.sort_order ASC, cc.id ASC LIMIT 1)`,
        })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .leftJoin(structures, eq(properties.id, structures.propertyId))
        .leftJoin(lastSales, eq(properties.id, lastSales.propertyId))
        .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
        .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
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
        })
        .from(propertyTransactions)
        .where(eq(propertyTransactions.propertyId, id))
        .orderBy(desc(propertyTransactions.recordingDate), desc(propertyTransactions.propertyTransactionsId));

    const propertyStatusRows = await db
        .select({ statusName: statuses.name })
        .from(propertyStatuses)
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(eq(propertyStatuses.propertyId, id));
    const propertyStatusNames = propertyStatusRows.map((r) => r.statusName);

    const sortedTxs = sortTransactionsDesc(allTxs);
    const { buyerPurchasePrice, buyerPurchaseDate, sellerPurchasePrice, sellerPurchaseDate, spread, latestArmsLengthTx } = calculateSpread(sortedTxs);
    const latest = latestArmsLengthTx;
    const buyerDisplayName = result.buyerCompanyName || (latest?.buyerName ?? null);
    const sellerDisplayName = result.sellerCompanyName || (latest?.sellerName ?? null);

    const txBuyerCompanyId = !result.buyerId && latest?.buyerId ? latest.buyerId : null;
    const txSellerCompanyId = !result.sellerId && latest?.sellerId ? latest.sellerId : null;
    const txCompanyIds = [txBuyerCompanyId, txSellerCompanyId].filter(Boolean) as string[];
    type TxCompany = { id: string; contactName: string | null; contactEmail: string | null; phoneNumber: string | null };
    const txCompanyMap = new Map<string, TxCompany>();
    if (txCompanyIds.length > 0) {
        const contactRows = await db
            .select()
            .from(companyContacts)
            .where(inArray(companyContacts.companyId, txCompanyIds))
            .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
        const primaryContactByCompanyId = new Map<string, typeof companyContacts.$inferSelect>();
        for (const row of contactRows) {
            if (!primaryContactByCompanyId.has(row.companyId)) primaryContactByCompanyId.set(row.companyId, row);
        }
        for (const id of txCompanyIds) {
            const primary = primaryContactByCompanyId.get(id);
            txCompanyMap.set(id, {
                id,
                contactName: primary ? [primary.firstName, primary.lastName].filter(Boolean).join(" ") || null : null,
                contactEmail: primary?.email ?? null,
                phoneNumber: primary?.phoneNumber ?? null,
            });
        }
    }
    const txBuyerCompany = txBuyerCompanyId ? txCompanyMap.get(txBuyerCompanyId) ?? null : null;
    const txSellerCompany = txSellerCompanyId ? txCompanyMap.get(txSellerCompanyId) ?? null : null;
    // DB column is the authoritative manual override; fall back to transaction lender check
    const isFinancedByARV = result.isArvFunded || (latest?.firstMtgLenderName?.trim().toUpperCase() === "ARV FINANCE INC");

    const lat = result.latitude ? Number(result.latitude) : null;
    const lon = result.longitude ? Number(result.longitude) : null;
    const baths = result.bathrooms ? Number(result.bathrooms) : null;
    const price = result.price ? Number(result.price) : 0;

    return {
        id: String(result.id),
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
        dateSold: result.dateSold
            ? (typeof result.dateSold === 'object' && result.dateSold !== null && 'toISOString' in result.dateSold
                ? (result.dateSold as Date).toISOString().split('T')[0]
                : String(result.dateSold).split('T')[0])
            : null,
        buyerId: result.buyerId ? String(result.buyerId) : null,
        buyerCompanyName: buyerDisplayName,
        buyerContactName: result.buyerContactName || txBuyerCompany?.contactName || null,
        buyerContactEmail: result.buyerContactEmail || txBuyerCompany?.contactEmail || null,
        buyerContactPhone: result.buyerContactPhone || txBuyerCompany?.phoneNumber || null,
        sellerId: result.sellerId ? String(result.sellerId) : null,
        sellerCompanyName: sellerDisplayName,
        sellerName: sellerDisplayName,
        sellerContactName: result.sellerContactName || txSellerCompany?.contactName || null,
        sellerContactEmail: result.sellerContactEmail || txSellerCompany?.contactEmail || null,
        sellerContactPhone: result.sellerContactPhone || txSellerCompany?.phoneNumber || null,
        buyerPurchasePrice,
        buyerPurchaseDate,
        sellerPurchasePrice,
        sellerPurchaseDate,
        spread,
        isFinancedByARV,
        companyId: result.buyerId ? String(result.buyerId) : (result.sellerId ? String(result.sellerId) : null),
        companyName: result.buyerCompanyName || result.sellerCompanyName || buyerDisplayName || sellerDisplayName || null,
        companyContactName: result.buyerContactName || result.sellerContactName || null,
        companyContactEmail: result.buyerContactEmail || result.sellerContactEmail || null,
        companyContactPhone: result.buyerContactPhone || result.sellerContactPhone || null,
        propertyOwner: result.buyerCompanyName || result.sellerCompanyName || buyerDisplayName || sellerDisplayName || null,
        propertyOwnerId: result.buyerId ? String(result.buyerId) : (result.sellerId ? String(result.sellerId) : null),
        purchasePrice: sellerPurchasePrice ?? price,
        saleValue: buyerPurchasePrice ?? price,
    };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export interface DeletePropertyResult {
    id: string;
    sfrPropertyId: number | null;
}

export async function deleteProperty(id: string): Promise<DeletePropertyResult | null> {
    const deleted = await db
        .delete(properties)
        .where(eq(properties.id, id))
        .returning();

    if (deleted.length === 0) return null;
    return { id: deleted[0].id, sfrPropertyId: deleted[0].sfrPropertyId };
}

// ─── Create / upsert ─────────────────────────────────────────────────────────

export interface CreatePropertyInput {
    address: string;
    city: string;
    state: string;
    zipCode: string;
}

export type CreatePropertyResult =
    | { status: "created"; id: string; sfrPropertyId: number }
    | { status: "updated"; id: string; sfrPropertyId: number }
    | { status: "missing-config" }
    | { status: "sfr-error"; httpStatus: number; error: string }
    | { status: "not-found" };

export async function createProperty(input: CreatePropertyInput): Promise<CreatePropertyResult> {
    const { address, city, state, zipCode } = input;

    const API_KEY = process.env.SFR_API_KEY;
    const API_URL = process.env.SFR_API_URL;
    if (!API_KEY || !API_URL) return { status: "missing-config" };

    const formattedAddress = `${address.toUpperCase()}, ${city.toUpperCase()}, ${state.toUpperCase()} ${zipCode}`;
    console.log(`Formatted address for SFR API: ${formattedAddress}`);

    const sfrApiUrl = `${API_URL}/properties/by-address?address=${encodeURIComponent(formattedAddress)}`;
    console.log(`Calling SFR API: ${sfrApiUrl}`);

    const sfrResponse = await fetch(sfrApiUrl, {
        method: "GET",
        headers: { "X-API-TOKEN": API_KEY },
    });

    if (!sfrResponse.ok) {
        const errorText = await sfrResponse.text();
        console.error(`SFR API error: ${sfrResponse.status} - ${errorText}`);
        return { status: "sfr-error", httpStatus: sfrResponse.status, error: errorText };
    }

    const propertyData = await sfrResponse.json();
    console.log("SFR API response received");

    if (!propertyData?.property_id) return { status: "not-found" };

    const sfrPropertyId = propertyData.property_id;
    const normalizedCounty = normalizeCountyName(propertyData.county);
    const buyerName: string | null = propertyData.current_sale?.buyer_1 || propertyData.currentSale?.buyer1 || null;
    const sellerName: string | null = propertyData.current_sale?.seller_1 || propertyData.currentSale?.seller1 || null;

    const allCompanies = await db.select().from(companies);
    const contactsMap = new Map<string, typeof allCompanies[0]>();
    for (const company of allCompanies) {
        const key = trimCompanyName(company.companyName);
        if (key) contactsMap.set(key, company);
    }

    const upsertCompany = async (companyName: string, county: string | null): Promise<string | null> => {
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
        } catch (companyError: any) {
            if (!companyError?.message?.includes("duplicate") && !companyError?.code?.includes("23505")) {
                console.error("Error creating company:", companyError);
                return null;
            }
            try {
                const [duplicateCompany] = await db.select().from(companies).where(eq(companies.companyName, name)).limit(1);
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

    const maybeInsertAcquisitionTransaction = async (propertyId: string, txBuyerId: string | null, buyerNameVal: string | null) => {
        if (!txBuyerId || !buyerNameVal) return;
        const lastSale = propertyData?.last_sale || propertyData?.lastSale;
        if (!lastSale?.date) return;
        const normalizedDate = normalizeDateToYMD(lastSale.date);
        if (!normalizedDate) return;
        const normalizedBuyerName = trimCompanyName(buyerNameVal);
        const cs = propertyData?.current_sale || propertyData?.currentSale;
        const sellerNameVal: string | null = cs ? trimCompanyName(cs.seller_1 || cs.seller1) || null : null;
        const [existing] = await db
            .select({ propertyId: propertyTransactions.propertyId })
            .from(propertyTransactions)
            .where(and(
                eq(propertyTransactions.propertyId, propertyId),
                eq(propertyTransactions.buyerId, txBuyerId),
                eq(propertyTransactions.recordingDate, normalizedDate),
                eq(propertyTransactions.transactionType, "acquisition")
            ))
            .limit(1);
        if (existing) return;
        await db.insert(propertyTransactions).values({
            propertyId,
            buyerId: txBuyerId,
            sellerId,
            transactionType: "acquisition",
            saleDate: normalizedDate,
            recordingDate: normalizedDate,
            salePrice: lastSale.price != null ? String(lastSale.price) : null,
            firstMtgAmount: lastSale.mtg_amount != null ? String(lastSale.mtg_amount) : null,
            buyerName: normalizedBuyerName,
            sellerName: sellerNameVal,
        });
    };

    const propertyListingStatus = (propertyData.listing_status || "").trim().toLowerCase();
    const isOnMarket = propertyListingStatus === "on market" || propertyListingStatus === "on_market";
    const listingStatus = isOnMarket ? "on-market" : "off-market";

    const [existingProperty] = await db
        .select()
        .from(properties)
        .where(eq(properties.sfrPropertyId, Number(sfrPropertyId)))
        .limit(1);

    if (existingProperty) {
        await db.update(properties).set({
            buyerId,
            sellerId,
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
        }).where(eq(properties.id, existingProperty.id));

        await maybeInsertAcquisitionTransaction(existingProperty.id, buyerId, buyerName);
        console.log(`Property updated: ${sfrPropertyId}`);
        return { status: "updated", id: existingProperty.id, sfrPropertyId: Number(sfrPropertyId) };
    }

    const [newProperty] = await db
        .insert(properties)
        .values({
            sfrPropertyId: Number(sfrPropertyId),
            buyerId,
            sellerId,
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

    await insertPropertyRelatedData(newProperty.id, propertyData as SfrPropertyData, normalizedCounty);
    await maybeInsertAcquisitionTransaction(newProperty.id, buyerId, buyerName);
    console.log(`Property created: ${sfrPropertyId} (ID: ${newProperty.id})`);
    return { status: "created", id: newProperty.id, sfrPropertyId: Number(sfrPropertyId) };
}

// ─── Patch ────────────────────────────────────────────────────────────────────

async function upsertCompanyByName(
    companyName: string,
    propertyCounty: string | null,
    propertyMsa: string | null
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

export interface PatchPropertyResult {
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
        transactions?: Array<{
            transactionType?: string | null;
            recordingDate: string;
            saleDate: string;
            buyerName?: string | null;
            sellerName?: string | null;
            salePrice?: string | null;
            firstMtgLenderName?: string | null;
        }>;
    }
): Promise<PatchPropertyResult | null> {
    const [existing] = await db
        .select({ id: properties.id, isArvFunded: properties.isArvFunded, county: properties.county, msa: properties.msa })
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

    if (data.buyerCompanyName !== undefined) {
        if (data.buyerCompanyName.trim() === '') {
            await db
                .update(properties)
                .set({ buyerId: null, updatedAt: new Date() })
                .where(eq(properties.id, id));
        } else {
            const newBuyerId = await upsertCompanyByName(data.buyerCompanyName, existing.county, existing.msa);
            if (newBuyerId) {
                await db
                    .update(properties)
                    .set({ buyerId: newBuyerId, updatedAt: new Date() })
                    .where(eq(properties.id, id));
            }
        }
    }

    if (data.sellerCompanyName !== undefined) {
        if (data.sellerCompanyName.trim() === '') {
            await db
                .update(properties)
                .set({ sellerId: null, updatedAt: new Date() })
                .where(eq(properties.id, id));
        } else {
            const newSellerId = await upsertCompanyByName(data.sellerCompanyName, existing.county, existing.msa);
            if (newSellerId) {
                await db
                    .update(properties)
                    .set({ sellerId: newSellerId, updatedAt: new Date() })
                    .where(eq(properties.id, id));
            }
        }
    }

    if (data.statuses !== undefined && data.statuses.length > 0) {
        const statusRows = await db
            .select({ id: statuses.id, name: statuses.name })
            .from(statuses)
            .where(inArray(statuses.name, data.statuses));

        await db.delete(propertyStatuses).where(eq(propertyStatuses.propertyId, id));

        if (statusRows.length > 0) {
            await db.insert(propertyStatuses).values(
                statusRows.map((s) => ({ propertyId: id, statusId: s.id }))
            );
        }
    }

    if (data.transactions !== undefined) {
        await appendPropertyTransactions(id, data.transactions, existing.county, existing.msa);
        await reprocessProperty(id);
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
