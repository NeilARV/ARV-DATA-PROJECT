import { db } from "server/storage";
import { companies } from "@database/schemas/companies.schema";
import { properties, addresses, propertyTransactions } from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { updateCompanySchema } from "@database/updates/companies.update";
import { sql, eq, or, and, gte, lte, inArray, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";

export const CONTACTS_PAGE_SIZE = 50;
export const CONTACTS_SORT_OPTIONS = [
    "alphabetical",
    "most-properties",
    "fewest-properties",
    "most-sold-properties",
    "most-sold-properties-all-time",
    "new-buyers",
    "buys-wholesale",
] as const;
export type ContactsSortOption = (typeof CONTACTS_SORT_OPTIONS)[number];

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface CompanySuggestion {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
}

export async function getCompanySuggestions(search: string): Promise<CompanySuggestion[]> {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    return db
        .select({
            id: companies.id,
            companyName: companies.companyName,
            contactName: companies.contactName,
            contactEmail: companies.contactEmail,
        })
        .from(companies)
        .where(sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchTerm}`)
        .orderBy(companies.companyName)
        .limit(5);
}

// ─── Contacts list ────────────────────────────────────────────────────────────

export interface GetContactsParams {
    county?: string;
    page?: string;
    limit?: string;
    sort?: string;
    search?: string;
}

export interface GetContactsResult {
    companies: any[];
    total: number;
    page: number;
    limit: number;
}

export async function getContacts(params: GetContactsParams): Promise<GetContactsResult> {
    const { county, page = "1", limit = String(CONTACTS_PAGE_SIZE), sort = "most-properties", search } = params;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || CONTACTS_PAGE_SIZE));
    const sortOption = (CONTACTS_SORT_OPTIONS as readonly string[]).includes(sort)
        ? (sort as ContactsSortOption)
        : "most-properties";
    const searchTerm = typeof search === "string" ? search.trim() : "";

    const conditions: ReturnType<typeof sql>[] = [];
    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(sql`LOWER(${companies.counties}::text) LIKE ${'%"' + normalizedCounty + '"%'}`);
    }
    if (searchTerm.length >= 2) {
        const searchPattern = `%${searchTerm.toLowerCase()}%`;
        conditions.push(
            or(
                sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchPattern}`,
                sql`LOWER(TRIM(COALESCE(${companies.contactName}, ''))) LIKE ${searchPattern}`,
                sql`LOWER(TRIM(COALESCE(${companies.contactEmail}, ''))) LIKE ${searchPattern}`
            ) as any
        );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const normalizedCountyForProps = county ? county.trim().toLowerCase() : null;
    const now = new Date();
    const ytdStartStr = `${now.getFullYear()}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);

    const canPaginateInDb = sortOption === "alphabetical" || sortOption === "new-buyers";
    type CompanyRow = typeof companies.$inferSelect;
    let contacts: CompanyRow[];
    let total: number;

    if (canPaginateInDb) {
        const baseContactsQuery = whereClause
            ? db.select().from(companies).where(whereClause as any)
            : db.select().from(companies);
        const offset = (pageNum - 1) * limitNum;
        const countQuery = whereClause
            ? db.select({ count: sql<number>`count(*)::int` }).from(companies).where(whereClause as any)
            : db.select({ count: sql<number>`count(*)::int` }).from(companies);
        const contactsPageQuery =
            sortOption === "alphabetical"
                ? baseContactsQuery.orderBy(companies.companyName).limit(limitNum).offset(offset)
                : baseContactsQuery.orderBy(desc(companies.createdAt)).limit(limitNum).offset(offset);

        const [totalResult, contactsPage] = await Promise.all([countQuery, contactsPageQuery]);
        total = Number((totalResult as { count: number }[])[0]?.count ?? 0);
        contacts = contactsPage as CompanyRow[];
    } else {
        const contactsQuery = whereClause
            ? db.select().from(companies).where(whereClause as any)
            : db.select().from(companies);
        contacts = (await contactsQuery.orderBy(companies.companyName)) as CompanyRow[];
        total = contacts.length;
    }

    const contactIds = contacts.map((c) => c.id).filter(Boolean) as string[];

    const propertyCountWhereParts: ReturnType<typeof sql>[] = [];
    if (normalizedCountyForProps) {
        propertyCountWhereParts.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCountyForProps}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCountyForProps}`
            ) as any
        );
    }
    if (canPaginateInDb && contactIds.length > 0) {
        propertyCountWhereParts.push(inArray(properties.buyerId, contactIds) as any);
    }
    const propertyCountWhere = propertyCountWhereParts.length > 0 ? and(...propertyCountWhereParts) : undefined;
    let propertyCountQuery = db
        .select({ buyerId: properties.buyerId, count: sql<number>`count(*)::int` })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId));
    if (propertyCountWhere) {
        propertyCountQuery = propertyCountQuery.where(propertyCountWhere as any) as typeof propertyCountQuery;
    }
    propertyCountQuery = propertyCountQuery.groupBy(properties.buyerId) as typeof propertyCountQuery;

    const ytdWhereParts: ReturnType<typeof sql>[] = [
        gte(propertyTransactions.recordingDate, ytdStartStr),
        lte(propertyTransactions.recordingDate, todayStr),
    ];
    if (canPaginateInDb && contactIds.length > 0) {
        ytdWhereParts.push(inArray(propertyTransactions.sellerId, contactIds) as any);
    }
    if (normalizedCountyForProps) {
        ytdWhereParts.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCountyForProps}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCountyForProps}`
            ) as any
        );
    }
    const soldYtdQuery = db
        .select({ sellerId: propertyTransactions.sellerId, count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(and(...ytdWhereParts))
        .groupBy(propertyTransactions.sellerId);

    const allTimeWhereParts: ReturnType<typeof sql>[] = [];
    if (canPaginateInDb && contactIds.length > 0) {
        allTimeWhereParts.push(inArray(propertyTransactions.sellerId, contactIds) as any);
    }
    if (normalizedCountyForProps) {
        allTimeWhereParts.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCountyForProps}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCountyForProps}`
            ) as any
        );
    }
    let soldAllTimeQuery = db
        .select({ sellerId: propertyTransactions.sellerId, count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId));
    if (allTimeWhereParts.length > 0) {
        soldAllTimeQuery = soldAllTimeQuery.where(and(...allTimeWhereParts)) as typeof soldAllTimeQuery;
    }
    soldAllTimeQuery = soldAllTimeQuery.groupBy(propertyTransactions.sellerId) as typeof soldAllTimeQuery;

    const wholesaleBuyWhereParts: ReturnType<typeof sql>[] = [sql`${statuses.name} = 'wholesale'`];
    if (canPaginateInDb && contactIds.length > 0) {
        wholesaleBuyWhereParts.push(inArray(properties.buyerId, contactIds) as any);
    }
    const wholesaleBuyQuery = db
        .select({ buyerId: properties.buyerId, count: sql<number>`count(*)::int` })
        .from(properties)
        .innerJoin(propertyStatuses, eq(properties.id, propertyStatuses.propertyId))
        .innerJoin(statuses, eq(propertyStatuses.statusId, statuses.id))
        .where(and(...wholesaleBuyWhereParts))
        .groupBy(properties.buyerId);

    const [propertyCountRows, soldCountRows, soldCountAllTimeRows, wholesaleBuyRows] = await Promise.all([
        propertyCountQuery,
        soldYtdQuery,
        soldAllTimeQuery,
        wholesaleBuyQuery,
    ]);

    const propertyCountByBuyerId = new Map<string, number>();
    propertyCountRows.forEach((row: { buyerId: string | null; count: number }) => {
        if (row.buyerId) propertyCountByBuyerId.set(row.buyerId, row.count);
    });
    const soldCountByCompanyId = new Map<string, number>();
    soldCountRows.forEach((row: { sellerId: string | null; count: number }) => {
        if (row.sellerId) soldCountByCompanyId.set(row.sellerId, row.count);
    });
    const soldCountAllTimeByCompanyId = new Map<string, number>();
    soldCountAllTimeRows.forEach((row: { sellerId: string | null; count: number }) => {
        if (row.sellerId) soldCountAllTimeByCompanyId.set(row.sellerId, row.count);
    });
    const wholesaleBuyCountByBuyerId = new Map<string, number>();
    wholesaleBuyRows.forEach((row: { buyerId: string | null; count: number }) => {
        if (row.buyerId) wholesaleBuyCountByBuyerId.set(row.buyerId, row.count);
    });

    const contactsWithCounts = contacts.map((contact) => ({
        ...contact,
        propertyCount: propertyCountByBuyerId.get(contact.id) ?? 0,
        propertiesSoldCount: soldCountByCompanyId.get(contact.id) ?? 0,
        propertiesSoldCountAllTime: soldCountAllTimeByCompanyId.get(contact.id) ?? 0,
        wholesaleBuyCount: wholesaleBuyCountByBuyerId.get(contact.id) ?? 0,
        isFinancedByARV: contact.isArvClient ?? false,
    }));

    const zeroCountFilter: Record<string, (c: typeof contactsWithCounts[0]) => boolean> = {
        "most-properties": (c) => c.propertyCount > 0,
        "fewest-properties": (c) => c.propertyCount > 0,
        "most-sold-properties": (c) => c.propertiesSoldCount > 0,
        "most-sold-properties-all-time": (c) => c.propertiesSoldCountAllTime > 0,
        "buys-wholesale": (c) => c.wholesaleBuyCount > 0,
    };
    const filterFn = zeroCountFilter[sortOption];
    if (filterFn) {
        const filtered = contactsWithCounts.filter(filterFn);
        contactsWithCounts.length = 0;
        contactsWithCounts.push(...filtered);
        total = contactsWithCounts.length;
    }

    let companiesPage: typeof contactsWithCounts;
    if (canPaginateInDb) {
        companiesPage = contactsWithCounts;
    } else {
        contactsWithCounts.sort((a, b) => {
            switch (sortOption) {
                case "most-properties": return b.propertyCount - a.propertyCount;
                case "fewest-properties": return a.propertyCount - b.propertyCount;
                case "most-sold-properties": return (b.propertiesSoldCount ?? 0) - (a.propertiesSoldCount ?? 0);
                case "most-sold-properties-all-time": return (b.propertiesSoldCountAllTime ?? 0) - (a.propertiesSoldCountAllTime ?? 0);
                case "buys-wholesale": return (b.wholesaleBuyCount ?? 0) - (a.wholesaleBuyCount ?? 0);
                default: return 0;
            }
        });
        const offset = (pageNum - 1) * limitNum;
        companiesPage = contactsWithCounts.slice(offset, offset + limitNum);
    }

    console.log(`Companies (county: ${county || "all"}, page: ${pageNum}, sort: ${sortOption}):`, companiesPage.length, "/", total);
    return { companies: companiesPage, total, page: pageNum, limit: limitNum };
}

// ─── Wholesale leaderboard ────────────────────────────────────────────────────

export async function getWholesaleLeaderboard(county?: string) {
    const normalizedCounty = county ? county.trim().toLowerCase() : null;

    const countRows = await db
        .select({ sellerId: properties.sellerId, count: sql<number>`count(*)::int` })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            normalizedCounty
                ? and(
                      sql`EXISTS (
                          SELECT 1 FROM property_statuses ps
                          JOIN statuses s ON s.id = ps.status_id
                          WHERE ps.property_id = ${properties.id}
                          AND s.name = 'wholesale'
                      )`,
                      or(
                          sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                          sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                      )
                  )
                : sql`EXISTS (
                      SELECT 1 FROM property_statuses ps
                      JOIN statuses s ON s.id = ps.status_id
                      WHERE ps.property_id = ${properties.id}
                      AND s.name = 'wholesale'
                  )`
        )
        .groupBy(properties.sellerId)
        .orderBy(sql`count(*) desc`)
        .limit(3);

    if (countRows.length === 0) return [];

    const sellerIds = countRows.map((r) => r.sellerId).filter(Boolean) as string[];
    const companyRows = await db
        .select({ id: companies.id, companyName: companies.companyName, contactName: companies.contactName })
        .from(companies)
        .where(inArray(companies.id, sellerIds));

    const companyById = new Map(companyRows.map((c) => [c.id, c]));
    return countRows
        .map((row, index) => {
            const company = row.sellerId ? companyById.get(row.sellerId) : null;
            if (!company) return null;
            return {
                rank: index + 1,
                companyId: company.id,
                companyName: company.companyName,
                wholesaleCount: row.count,
                contactName: company.contactName ?? null,
            };
        })
        .filter(Boolean);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(county: string) {
    const normalizedCounty = county.trim().toLowerCase();
    const buyerCompanies = alias(companies, "buyer_companies");
    const sellerCompanies = alias(companies, "seller_companies");

    const allProperties = await db
        .select({
            buyerCompanyName: buyerCompanies.companyName,
            buyerContactName: buyerCompanies.contactName,
            sellerCompanyName: sellerCompanies.companyName,
            sellerContactName: sellerCompanies.contactName,
        })
        .from(properties)
        .leftJoin(buyerCompanies, eq(properties.buyerId, buyerCompanies.id))
        .leftJoin(sellerCompanies, eq(properties.sellerId, sellerCompanies.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
            ) as any
        ) as any;

    const companyCounts: Record<string, number> = {};
    const companyContactNames: Record<string, string | null> = {};
    type Prop = { buyerCompanyName: string | null; buyerContactName: string | null; sellerCompanyName: string | null; sellerContactName: string | null };
    allProperties.forEach((p: Prop) => {
        const addCompany = (name: string | null, contact: string | null) => {
            if (!name) return;
            const companyName = name.trim();
            companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
            if (contact && !companyContactNames[companyName]) {
                companyContactNames[companyName] = contact.trim();
            } else if (!(companyName in companyContactNames)) {
                companyContactNames[companyName] = null;
            }
        };
        addCompany(p.buyerCompanyName, p.buyerContactName);
        if (p.sellerCompanyName !== p.buyerCompanyName) {
            addCompany(p.sellerCompanyName, p.sellerContactName);
        }
    });

    const topCompanies = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count], index) => ({ rank: index + 1, name, count, contactName: companyContactNames[name] || null }));

    const propertiesWithAddresses = await db
        .select({ zipCode: addresses.zipCode })
        .from(properties)
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`);

    const zipCounts: Record<string, number> = {};
    propertiesWithAddresses.forEach((p: { zipCode: string | null }) => {
        if (p.zipCode) {
            const zip = p.zipCode.trim();
            zipCounts[zip] = (zipCounts[zip] || 0) + 1;
        }
    });

    const topZipCodes = Object.entries(zipCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([zipCode, count], index) => ({ rank: index + 1, zipCode, count }));

    return { companies: topCompanies, zipCodes: topZipCodes };
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getCompanyById(id: string, county?: string) {
    const contact = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (contact.length === 0) return null;
    const result = contact[0];
    const normalizedCounty = county ? county.trim().toLowerCase() : null;

    const now = new Date();
    const ytdStartStr = `${now.getFullYear()}-01-01`;
    const todayStr = now.toISOString().slice(0, 10);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

    const [sellerCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .where(and(
            eq(propertyTransactions.sellerId, id),
            gte(propertyTransactions.recordingDate, ytdStartStr),
            lte(propertyTransactions.recordingDate, todayStr)
        ));

    const [sellerCountAllTimeResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .where(eq(propertyTransactions.sellerId, id));

    let propertyCount: number;
    if (normalizedCounty) {
        const [propertyCountResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(properties)
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(and(
                eq(properties.buyerId, id),
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`
                ) as any
            ));
        propertyCount = propertyCountResult?.count ?? 0;
    } else {
        const [propertyCountResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(properties)
            .where(eq(properties.buyerId, id));
        propertyCount = propertyCountResult?.count ?? 0;
    }

    const acquisitions90Day = await db
        .select({ recordingDate: propertyTransactions.recordingDate })
        .from(propertyTransactions)
        .where(and(
            eq(propertyTransactions.buyerId, id),
            gte(propertyTransactions.recordingDate, ninetyDaysAgoStr),
            lte(propertyTransactions.recordingDate, todayStr)
        ));

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months: { key: string; count: number }[] = [];
    const cursor = new Date(ninetyDaysAgo.getFullYear(), ninetyDaysAgo.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= endMonth) {
        months.push({ key: monthNames[cursor.getMonth()], count: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    acquisitions90Day.forEach((row) => {
        const raw = row.recordingDate as string | Date | null;
        const dateStr = typeof raw === "string" ? raw : raw instanceof Date ? raw.toISOString().slice(0, 10) : null;
        if (dateStr) {
            const [, m] = dateStr.split("-").map(Number);
            const monthKey = monthNames[m - 1];
            const existing = months.find((mo) => mo.key === monthKey);
            if (existing) existing.count++;
        }
    });

    return {
        ...result,
        propertyCount,
        propertiesSoldCount: sellerCountResult?.count ?? 0,
        propertiesSoldCountAllTime: sellerCountAllTimeResult?.count ?? 0,
        acquisition90DayTotal: acquisitions90Day.length,
        acquisition90DayByMonth: months,
    };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export type UpdateCompanyResult =
    | { status: "ok"; company: typeof companies.$inferSelect }
    | { status: "not-found" }
    | { status: "duplicate-name" };

export async function updateCompany(id: string, data: UpdateCompanyInput): Promise<UpdateCompanyResult> {
    const existing = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (existing.length === 0) return { status: "not-found" };

    if (data.companyName && data.companyName !== existing[0].companyName) {
        const duplicate = await db.select().from(companies).where(eq(companies.companyName, data.companyName)).limit(1);
        if (duplicate.length > 0) return { status: "duplicate-name" };
    }

    const updateFields: any = {};
    if (data.contactName !== undefined) updateFields.contactName = data.contactName;
    if (data.contactEmail !== undefined) updateFields.contactEmail = data.contactEmail;
    if (data.phoneNumber !== undefined) updateFields.phoneNumber = data.phoneNumber;
    if (data.counties !== undefined) updateFields.counties = data.counties;
    if (data.companyName !== undefined) updateFields.companyName = data.companyName;
    updateFields.updatedAt = new Date();

    const [updatedContact] = await db
        .update(companies)
        .set(updateFields)
        .where(eq(companies.id, id))
        .returning();

    console.log(`Updated company: ${updatedContact.companyName} (ID: ${id})`);
    return { status: "ok", company: updatedContact };
}
