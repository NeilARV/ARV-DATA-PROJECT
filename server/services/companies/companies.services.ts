import { db } from "server/storage";
import { companies, companyContacts } from "@database/schemas/companies.schema";
import { properties, addresses, propertyTransactions } from "@database/schemas/properties.schema";
import { statuses, propertyStatuses } from "@database/schemas/statuses.schema";
import { updateCompanySchema, updateCompanyContactSchema } from "@database/updates/companies.update";
import { insertCompanyContactSchema } from "@database/inserts/companyContacts.insert";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PrimaryContact = typeof companyContacts.$inferSelect;

function buildContactName(contact: PrimaryContact | null | undefined): string | null {
    if (!contact) return null;
    return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
}

async function fetchPrimaryContacts(companyIds: string[]): Promise<Map<string, PrimaryContact>> {
    if (companyIds.length === 0) return new Map();
    const rows = await db
        .select()
        .from(companyContacts)
        .where(inArray(companyContacts.companyId, companyIds))
        .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
    const map = new Map<string, PrimaryContact>();
    for (const row of rows) {
        if (!map.has(row.companyId)) map.set(row.companyId, row);
    }
    return map;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface CompanySuggestion {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
}

export async function getCompanySuggestions(search: string, county?: string): Promise<CompanySuggestion[]> {
    const searchTerm = `%${search.trim().toLowerCase()}%`;
    const conditions: ReturnType<typeof sql>[] = [
        sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchTerm}`,
    ];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            sql`EXISTS (SELECT 1 FROM company_counties cc WHERE cc.company_id = ${companies.id} AND LOWER(cc.county) = ${normalizedCounty})`
        );
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const results = await db
        .select({ id: companies.id, companyName: companies.companyName })
        .from(companies)
        .where(whereClause as any)
        .orderBy(companies.companyName)
        .limit(5);

    if (results.length === 0) return [];

    const primaryContacts = await fetchPrimaryContacts(results.map((r) => r.id));
    return results.map((r) => {
        const primary = primaryContacts.get(r.id) ?? null;
        return {
            id: r.id,
            companyName: r.companyName,
            contactName: buildContactName(primary),
            contactEmail: primary?.email ?? null,
        };
    });
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
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM company_counties cc
                WHERE cc.company_id = ${companies.id}
                AND LOWER(cc.county) = ${normalizedCounty}
            )`
        );
    }
    if (searchTerm.length >= 2) {
        const searchPattern = `%${searchTerm.toLowerCase()}%`;
        conditions.push(
            or(
                sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchPattern}`,
                sql`EXISTS (
                    SELECT 1 FROM company_contacts con
                    WHERE con.company_id = ${companies.id}
                    AND (
                        LOWER(TRIM(con.first_name || ' ' || COALESCE(con.last_name, ''))) LIKE ${searchPattern}
                        OR LOWER(TRIM(COALESCE(con.email, ''))) LIKE ${searchPattern}
                    )
                )`
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

    const primaryContactsQuery = fetchPrimaryContacts(contactIds);

    const [propertyCountRows, soldCountRows, soldCountAllTimeRows, wholesaleBuyRows, primaryContacts] = await Promise.all([
        propertyCountQuery,
        soldYtdQuery,
        soldAllTimeQuery,
        wholesaleBuyQuery,
        primaryContactsQuery,
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

    const contactsWithCounts = contacts.map((contact) => {
        const primary = primaryContacts.get(contact.id) ?? null;
        return {
            ...contact,
            contactName: buildContactName(primary),
            contactEmail: primary?.email ?? null,
            phoneNumber: primary?.phoneNumber ?? null,
            propertyCount: propertyCountByBuyerId.get(contact.id) ?? 0,
            propertiesSoldCount: soldCountByCompanyId.get(contact.id) ?? 0,
            propertiesSoldCountAllTime: soldCountAllTimeByCompanyId.get(contact.id) ?? 0,
            wholesaleBuyCount: wholesaleBuyCountByBuyerId.get(contact.id) ?? 0,
            isFinancedByARV: contact.isArvClient ?? false,
        };
    });

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
    const [companyRows, primaryContacts] = await Promise.all([
        db
            .select({ id: companies.id, companyName: companies.companyName })
            .from(companies)
            .where(inArray(companies.id, sellerIds)),
        fetchPrimaryContacts(sellerIds),
    ]);

    const companyById = new Map(companyRows.map((c) => [c.id, c]));
    return countRows
        .map((row, index) => {
            const company = row.sellerId ? companyById.get(row.sellerId) : null;
            if (!company) return null;
            const primary = row.sellerId ? primaryContacts.get(row.sellerId) ?? null : null;
            return {
                rank: index + 1,
                companyId: company.id,
                companyName: company.companyName,
                wholesaleCount: row.count,
                contactName: buildContactName(primary),
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
            sellerCompanyName: sellerCompanies.companyName,
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
    type Prop = { buyerCompanyName: string | null; sellerCompanyName: string | null };
    allProperties.forEach((p: Prop) => {
        const addCompany = (name: string | null) => {
            if (!name) return;
            const companyName = name.trim();
            companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
        };
        addCompany(p.buyerCompanyName);
        if (p.sellerCompanyName !== p.buyerCompanyName) {
            addCompany(p.sellerCompanyName);
        }
    });

    const topCompanies = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count], index) => ({ rank: index + 1, name, count, contactName: null as string | null }));

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

    const [acquisitions90Day, contactsList] = await Promise.all([
        db
            .select({ recordingDate: propertyTransactions.recordingDate })
            .from(propertyTransactions)
            .where(and(
                eq(propertyTransactions.buyerId, id),
                gte(propertyTransactions.recordingDate, ninetyDaysAgoStr),
                lte(propertyTransactions.recordingDate, todayStr)
            )),
        db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.companyId, id))
            .orderBy(companyContacts.sortOrder, companyContacts.id),
    ]);

    const primaryContact = contactsList[0] ?? null;

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
        contacts: contactsList,
        contactName: buildContactName(primaryContact),
        contactEmail: primaryContact?.email ?? null,
        phoneNumber: primaryContact?.phoneNumber ?? null,
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

    const updateFields: any = {};
    if (data.isArvClient !== undefined) updateFields.isArvClient = data.isArvClient;
    updateFields.updatedAt = new Date();

    const [updatedContact] = await db
        .update(companies)
        .set(updateFields)
        .where(eq(companies.id, id))
        .returning();

    console.log(`Updated company: ${updatedContact.companyName} (ID: ${id})`);
    return { status: "ok", company: updatedContact };
}

// ─── Company Contacts ─────────────────────────────────────────────────────────

export type AddContactInput = z.infer<typeof insertCompanyContactSchema>;
export type UpdateContactInput = z.infer<typeof updateCompanyContactSchema>;

export type ContactMutationResult =
    | { status: "ok"; contact: typeof companyContacts.$inferSelect }
    | { status: "company-not-found" }
    | { status: "contact-not-found" };

export async function addContact(companyId: string, data: AddContactInput): Promise<ContactMutationResult> {
    const existing = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (existing.length === 0) return { status: "company-not-found" };

    const [{ nextSortOrder }] = await db
        .select({ nextSortOrder: sql<number>`COALESCE(MAX(${companyContacts.sortOrder}), 0) + 1` })
        .from(companyContacts)
        .where(eq(companyContacts.companyId, companyId));

    const [inserted] = await db
        .insert(companyContacts)
        .values({
            companyId,
            firstName: data.firstName,
            lastName: data.lastName ?? null,
            email: data.email ?? null,
            phoneNumber: data.phoneNumber ?? null,
            title: data.title ?? null,
            sortOrder: nextSortOrder ?? 1,
        })
        .returning();

    console.log(`Added contact ${inserted.firstName} to company ${companyId}`);
    return { status: "ok", contact: inserted };
}

export async function updateContact(companyId: string, contactId: number, data: UpdateContactInput): Promise<ContactMutationResult> {
    const existing = await db
        .select()
        .from(companyContacts)
        .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)))
        .limit(1);
    if (existing.length === 0) return { status: "contact-not-found" };

    const updateFields: Partial<typeof companyContacts.$inferInsert> = { updatedAt: new Date() };
    if (data.firstName !== undefined) updateFields.firstName = data.firstName;
    if (data.lastName !== undefined) updateFields.lastName = data.lastName ?? null;
    if (data.email !== undefined) updateFields.email = (data.email as string | null) ?? null;
    if (data.phoneNumber !== undefined) updateFields.phoneNumber = data.phoneNumber ?? null;
    if (data.title !== undefined) updateFields.title = data.title ?? null;

    const [updated] = await db
        .update(companyContacts)
        .set(updateFields)
        .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)))
        .returning();

    console.log(`Updated contact ${contactId} on company ${companyId}`);
    return { status: "ok", contact: updated };
}

export type DeleteContactResult =
    | { status: "ok" }
    | { status: "contact-not-found" };

export async function deleteContact(companyId: string, contactId: number): Promise<DeleteContactResult> {
    const deleted = await db
        .delete(companyContacts)
        .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)))
        .returning({ id: companyContacts.id });

    if (deleted.length === 0) return { status: "contact-not-found" };
    console.log(`Deleted contact ${contactId} from company ${companyId}`);
    return { status: "ok" };
}
