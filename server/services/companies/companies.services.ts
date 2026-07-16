import { db } from 'server/storage';
import {
    companies,
    companyContacts,
    companyDetails,
    companyAddresses,
} from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import {
    updateCompanySchema,
    updateCompanyContactSchema,
} from '@database/updates/companies.update';
import { insertCompanyContactSchema } from '@database/inserts/companyContacts.insert';
import { sql, eq, or, and, gte, lte, inArray, desc } from 'drizzle-orm';
import { OpenCorporatesService } from 'server/services/opencorporates';
import type { z } from 'zod';
import { formatCompanyName } from '@shared/utils/formatCompanyName';
import { formatContactName } from '@shared/utils/formatContactName';
import { clampLimit } from 'server/utils/clampLimit';
import { normalizeDateToYMD } from 'server/utils/normalization';

export const CONTACTS_PAGE_SIZE = 50;
export const CONTACTS_SORT_OPTIONS = [
    'most-properties',
    'most-sold-properties',
    'most-sold-properties-all-time',
    'most-bought-properties',
    'most-bought-properties-all-time',
    'new-buyers',
    'buys-wholesale',
    'wholesalers',
] as const;
type ContactsSortOption = (typeof CONTACTS_SORT_OPTIONS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PrimaryContact = typeof companyContacts.$inferSelect;

function buildContactName(contact: PrimaryContact | null | undefined): string | null {
    if (!contact) return null;
    const raw = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;
    return formatContactName(raw);
}

function contactMatchesSearch(contact: PrimaryContact, needle: string): boolean {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(needle) || (contact.email ?? '').toLowerCase().includes(needle);
}

/** First contact per company (sort order), preferring one matching `preferMatching` when given. */
async function fetchPrimaryContacts(
    companyIds: string[],
    preferMatching?: string,
): Promise<Map<string, PrimaryContact>> {
    if (companyIds.length === 0) return new Map();
    const rows = await db
        .select()
        .from(companyContacts)
        .where(inArray(companyContacts.companyId, companyIds))
        .orderBy(companyContacts.companyId, companyContacts.sortOrder, companyContacts.id);
    const map = new Map<string, PrimaryContact>();
    for (const row of rows) {
        const current = map.get(row.companyId);
        if (!current) {
            map.set(row.companyId, row);
        } else if (
            preferMatching &&
            !contactMatchesSearch(current, preferMatching) &&
            contactMatchesSearch(row, preferMatching)
        ) {
            map.set(row.companyId, row);
        }
    }
    return map;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

interface CompanySuggestion {
    id: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string | null;
}

/** Companies whose name — or a contact's name/email — matches the search (max 5), each with its best-matching contact. */
export async function getCompanySuggestions(
    search: string,
    county?: string,
): Promise<CompanySuggestion[]> {
    const needle = search.trim().toLowerCase();
    const searchTerm = `%${needle}%`;
    const conditions: ReturnType<typeof sql>[] = [
        or(
            sql`LOWER(TRIM(${companies.companyName})) LIKE ${searchTerm}`,
            sql`EXISTS (
                SELECT 1 FROM company_contacts con
                WHERE con.company_id = ${companies.id}
                AND (
                    LOWER(TRIM(con.first_name || ' ' || COALESCE(con.last_name, ''))) LIKE ${searchTerm}
                    OR LOWER(TRIM(COALESCE(con.email, ''))) LIKE ${searchTerm}
                )
            )`,
        ) as any,
    ];

    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            sql`EXISTS (SELECT 1 FROM company_counties cc WHERE cc.company_id = ${companies.id} AND LOWER(cc.county) = ${normalizedCounty})`,
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

    const primaryContacts = await fetchPrimaryContacts(
        results.map((r) => r.id),
        needle,
    );
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

interface GetContactsParams {
    county?: string;
    page?: string;
    limit?: string;
    sort?: string;
    search?: string;
}

interface GetContactsResult {
    companies: any[];
    total: number;
    page: number;
    limit: number;
}

export async function getContacts(params: GetContactsParams): Promise<GetContactsResult> {
    const {
        county,
        page = '1',
        limit = String(CONTACTS_PAGE_SIZE),
        sort = 'most-properties',
        search,
    } = params;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = clampLimit(limit, { fallback: CONTACTS_PAGE_SIZE, max: 100 });
    const sortOption = (CONTACTS_SORT_OPTIONS as readonly string[]).includes(sort)
        ? (sort as ContactsSortOption)
        : 'most-properties';
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    const conditions: ReturnType<typeof sql>[] = [];
    if (county) {
        const normalizedCounty = county.trim().toLowerCase();
        conditions.push(
            sql`EXISTS (
                SELECT 1 FROM company_counties cc
                WHERE cc.company_id = ${companies.id}
                AND LOWER(cc.county) = ${normalizedCounty}
            )`,
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
                )`,
            ) as any,
        );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const normalizedCountyForProps = county ? county.trim().toLowerCase() : null;
    const now = new Date();
    const ytdStartStr = `${now.getFullYear()}-01-01`;
    const todayStr = normalizeDateToYMD(now)!;

    const canPaginateInDb = sortOption === 'new-buyers';
    type CompanyRow = typeof companies.$inferSelect;
    let contacts: CompanyRow[];
    let total: number;

    if (canPaginateInDb) {
        const baseContactsQuery = whereClause
            ? db
                  .select()
                  .from(companies)
                  .where(whereClause as any)
            : db.select().from(companies);
        const offset = (pageNum - 1) * limitNum;
        const countQuery = whereClause
            ? db
                  .select({ count: sql<number>`count(*)::int` })
                  .from(companies)
                  .where(whereClause as any)
            : db.select({ count: sql<number>`count(*)::int` }).from(companies);
        const contactsPageQuery = baseContactsQuery
            .orderBy(desc(companies.createdAt))
            .limit(limitNum)
            .offset(offset);

        const [totalResult, contactsPage] = await Promise.all([countQuery, contactsPageQuery]);
        total = Number((totalResult as { count: number }[])[0]?.count ?? 0);
        contacts = contactsPage as CompanyRow[];
    } else {
        const contactsQuery = whereClause
            ? db
                  .select()
                  .from(companies)
                  .where(whereClause as any)
            : db.select().from(companies);
        contacts = (await contactsQuery.orderBy(companies.companyName)) as CompanyRow[];
        total = contacts.length;
    }

    const contactIds = contacts.map((c) => c.id).filter(Boolean) as string[];

    // Only run the count query needed for the active sort — running all of them
    // in parallel on every load saturated the DB with full-table scans.
    const countyParts = (): ReturnType<typeof sql>[] =>
        normalizedCountyForProps
            ? [
                  or(
                      sql`LOWER(TRIM(${properties.county})) = ${normalizedCountyForProps}`,
                      sql`LOWER(TRIM(${addresses.county})) = ${normalizedCountyForProps}`,
                  ) as any,
              ]
            : [];

    type SortRow = { id: string | null; count: number };

    async function fetchSortCount(): Promise<Map<string, number>> {
        const map = new Map<string, number>();
        let rows: SortRow[];

        if (sortOption === 'most-properties') {
            const parts: ReturnType<typeof sql>[] = [
                sql`${propertyTransactions.sortOrder} = 1`,
                sql`${propertyTransactions.buyerId} IS NOT NULL`,
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.buyerId, contactIds) as any);
            rows = (await db
                .select({
                    id: propertyTransactions.buyerId,
                    count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`,
                })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.buyerId)) as SortRow[];
        } else if (sortOption === 'most-sold-properties') {
            const parts: ReturnType<typeof sql>[] = [
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                gte(propertyTransactions.recordingDate, ytdStartStr),
                lte(propertyTransactions.recordingDate, todayStr),
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.sellerId, contactIds) as any);
            rows = (await db
                .select({ id: propertyTransactions.sellerId, count: sql<number>`count(*)::int` })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.sellerId)) as SortRow[];
        } else if (sortOption === 'most-sold-properties-all-time') {
            const parts: ReturnType<typeof sql>[] = [
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.sellerId, contactIds) as any);
            rows = (await db
                .select({ id: propertyTransactions.sellerId, count: sql<number>`count(*)::int` })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.sellerId)) as SortRow[];
        } else if (sortOption === 'most-bought-properties') {
            const parts: ReturnType<typeof sql>[] = [
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                gte(propertyTransactions.recordingDate, ytdStartStr),
                lte(propertyTransactions.recordingDate, todayStr),
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.buyerId, contactIds) as any);
            rows = (await db
                .select({ id: propertyTransactions.buyerId, count: sql<number>`count(*)::int` })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.buyerId)) as SortRow[];
        } else if (sortOption === 'most-bought-properties-all-time') {
            const parts: ReturnType<typeof sql>[] = [
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.buyerId, contactIds) as any);
            rows = (await db
                .select({ id: propertyTransactions.buyerId, count: sql<number>`count(*)::int` })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.buyerId)) as SortRow[];
        } else if (sortOption === 'buys-wholesale') {
            // End buyer on a wholesale property: buyer_id on the sort_order=1 (most recent) transaction
            // where the property has status 'wholesale'. sort_order=1 is the final purchase — the company
            // that bought FROM the wholesaler, not intermediate or assignment legs.
            const parts: ReturnType<typeof sql>[] = [
                sql`${propertyTransactions.sortOrder} = 1`,
                sql`${propertyTransactions.buyerId} IS NOT NULL`,
                sql`EXISTS (
                    SELECT 1 FROM property_statuses ps
                    JOIN statuses s ON s.id = ps.status_id
                    WHERE ps.property_id = ${propertyTransactions.propertyId}
                    AND s.name = 'wholesale'
                )`,
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.buyerId, contactIds) as any);
            rows = (await db
                .select({
                    id: propertyTransactions.buyerId,
                    count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`,
                })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.buyerId)) as SortRow[];
        } else if (sortOption === 'wholesalers') {
            // Wholesaler: seller_id on the sort_order=1 (most recent) transaction for a wholesale property.
            // The seller on the final transaction is the company that sold TO the end buyer — the wholesaler.
            const parts: ReturnType<typeof sql>[] = [
                sql`${propertyTransactions.sortOrder} = 1`,
                sql`${propertyTransactions.sellerId} IS NOT NULL`,
                sql`EXISTS (
                    SELECT 1 FROM property_statuses ps
                    JOIN statuses s ON s.id = ps.status_id
                    WHERE ps.property_id = ${propertyTransactions.propertyId}
                    AND s.id = 4
                )`,
                ...countyParts(),
            ];
            if (contactIds.length > 0)
                parts.push(inArray(propertyTransactions.sellerId, contactIds) as any);
            rows = (await db
                .select({
                    id: propertyTransactions.sellerId,
                    count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`,
                })
                .from(propertyTransactions)
                .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
                .leftJoin(addresses, eq(properties.id, addresses.propertyId))
                .where(and(...parts))
                .groupBy(propertyTransactions.sellerId)) as SortRow[];
        } else {
            rows = [];
        }

        rows.forEach((row) => {
            if (row.id) map.set(row.id, row.count);
        });
        return map;
    }

    const [sortCountMap, primaryContacts] = await Promise.all([
        fetchSortCount(),
        fetchPrimaryContacts(contactIds),
    ]);

    const contactsWithCounts = contacts.map((contact) => {
        const primary = primaryContacts.get(contact.id) ?? null;
        const sortCount = sortCountMap.get(contact.id) ?? 0;
        return {
            ...contact,
            contactName: buildContactName(primary),
            contactEmail: primary?.email ?? null,
            phoneNumber: primary?.phoneNumber ?? null,
            propertyCount: sortOption === 'most-properties' ? sortCount : 0,
            propertiesSoldCount: sortOption === 'most-sold-properties' ? sortCount : 0,
            propertiesSoldCountAllTime:
                sortOption === 'most-sold-properties-all-time' ? sortCount : 0,
            propertiesBoughtCount: sortOption === 'most-bought-properties' ? sortCount : 0,
            propertiesBoughtCountAllTime:
                sortOption === 'most-bought-properties-all-time' ? sortCount : 0,
            wholesaleBuyCount: sortOption === 'buys-wholesale' ? sortCount : 0,
            wholesalerCount: sortOption === 'wholesalers' ? sortCount : 0,
            isFinancedByARV: contact.isArvClient ?? false,
        };
    });

    const zeroCountFilter: Record<string, (c: (typeof contactsWithCounts)[0]) => boolean> = {
        'most-properties': (c) => c.propertyCount > 0,
        'most-sold-properties': (c) => c.propertiesSoldCount > 0,
        'most-sold-properties-all-time': (c) => c.propertiesSoldCountAllTime > 0,
        'most-bought-properties': (c) => c.propertiesBoughtCount > 0,
        'most-bought-properties-all-time': (c) => c.propertiesBoughtCountAllTime > 0,
        'buys-wholesale': (c) => c.wholesaleBuyCount > 0,
        wholesalers: (c) => c.wholesalerCount > 0,
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
                case 'most-properties':
                    return b.propertyCount - a.propertyCount;
                case 'most-sold-properties':
                    return (b.propertiesSoldCount ?? 0) - (a.propertiesSoldCount ?? 0);
                case 'most-sold-properties-all-time':
                    return (
                        (b.propertiesSoldCountAllTime ?? 0) - (a.propertiesSoldCountAllTime ?? 0)
                    );
                case 'most-bought-properties':
                    return (b.propertiesBoughtCount ?? 0) - (a.propertiesBoughtCount ?? 0);
                case 'most-bought-properties-all-time':
                    return (
                        (b.propertiesBoughtCountAllTime ?? 0) -
                        (a.propertiesBoughtCountAllTime ?? 0)
                    );
                case 'buys-wholesale':
                    return (b.wholesaleBuyCount ?? 0) - (a.wholesaleBuyCount ?? 0);
                case 'wholesalers':
                    return (b.wholesalerCount ?? 0) - (a.wholesalerCount ?? 0);
                default:
                    return 0;
            }
        });
        const offset = (pageNum - 1) * limitNum;
        companiesPage = contactsWithCounts.slice(offset, offset + limitNum);
    }

    console.log(
        `Companies (county: ${county || 'all'}, page: ${pageNum}, sort: ${sortOption}):`,
        companiesPage.length,
        '/',
        total,
    );
    return { companies: companiesPage, total, page: pageNum, limit: limitNum };
}

// ─── Wholesale leaderboard ────────────────────────────────────────────────────

export async function getWholesaleLeaderboard(county?: string) {
    const normalizedCounty = county ? county.trim().toLowerCase() : null;

    // Ranks the top wholesalers — the assignors on wholesale-status sales. An assignor is the
    // middleman on a wholesale flip; assignor_id is set only on rows flagged is_assignment, so
    // filtering on it (not on a now-removed 'assignment' transaction type) is what surfaces them.
    const wholesaleWhereParts: ReturnType<typeof sql>[] = [
        sql`${propertyTransactions.assignorId} IS NOT NULL`,
        sql`EXISTS (
            SELECT 1 FROM property_statuses ps
            JOIN statuses s ON s.id = ps.status_id
            WHERE ps.property_id = ${properties.id}
            AND s.name = 'wholesale'
        )`,
    ];
    if (normalizedCounty) {
        wholesaleWhereParts.push(
            or(
                sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
            ) as any,
        );
    }
    const countRows = await db
        .select({
            assignorId: propertyTransactions.assignorId,
            count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`,
        })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(and(...wholesaleWhereParts))
        .groupBy(propertyTransactions.assignorId)
        .orderBy(sql`count(DISTINCT ${propertyTransactions.propertyId}) desc`)
        .limit(3);

    if (countRows.length === 0) return [];

    const assignorIds = countRows.map((r) => r.assignorId).filter(Boolean) as string[];
    const [companyRows, primaryContacts] = await Promise.all([
        db
            .select({ id: companies.id, companyName: companies.companyName })
            .from(companies)
            .where(inArray(companies.id, assignorIds)),
        fetchPrimaryContacts(assignorIds),
    ]);

    const companyById = new Map(companyRows.map((c) => [c.id, c]));
    return countRows
        .map((row, index) => {
            const company = row.assignorId ? companyById.get(row.assignorId) : null;
            if (!company) return null;
            const primary = row.assignorId ? (primaryContacts.get(row.assignorId) ?? null) : null;
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

    const allTransactions = await db
        .select({
            buyerName: propertyTransactions.buyerName,
            sellerName: propertyTransactions.sellerName,
        })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            and(
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                or(
                    sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                    sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
                ) as any,
            ),
        );

    const companyCounts: Record<string, number> = {};
    type TxRow = { buyerName: string | null; sellerName: string | null };
    allTransactions.forEach((p: TxRow) => {
        const addCompany = (name: string | null) => {
            if (!name) return;
            const companyName = name.trim();
            companyCounts[companyName] = (companyCounts[companyName] || 0) + 1;
        };
        addCompany(p.buyerName);
        if (p.sellerName !== p.buyerName) {
            addCompany(p.sellerName);
        }
    });

    const topCompanyEntries = Object.entries(companyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const topCompanyNames = topCompanyEntries.map(([name]) => name);

    const contactRows = await db
        .select({
            companyName: companies.companyName,
            firstName: companyContacts.firstName,
            lastName: companyContacts.lastName,
        })
        .from(companies)
        .innerJoin(companyContacts, eq(companyContacts.companyId, companies.id))
        .where(
            inArray(
                sql`LOWER(TRIM(${companies.companyName}))`,
                topCompanyNames.map((n) => n.toLowerCase()),
            ),
        )
        .orderBy(companyContacts.sortOrder);

    const contactByCompany: Record<string, string> = {};
    for (const row of contactRows) {
        const key = row.companyName.trim().toLowerCase();
        if (!contactByCompany[key]) {
            contactByCompany[key] =
                formatContactName([row.firstName, row.lastName].filter(Boolean).join(' ')) ?? '';
        }
    }

    const topCompanies = topCompanyEntries.map(([name, count], index) => {
        const formattedName = formatCompanyName(name) ?? name;
        const contactName = contactByCompany[name.toLowerCase()] ?? null;
        return { rank: index + 1, name: formattedName, count, contactName };
    });

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
    const todayStr = normalizeDateToYMD(now)!;
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = normalizeDateToYMD(ninetyDaysAgo)!;
    // The bar graph spans the same months as the 90-day window (first day of the
    // earliest 90-day month → today) but counts the FULL month, not just the portion
    // inside the 90 days — so its query is a strict superset of the 90-day window, and
    // the 90-day total is recovered by filtering that result below (one query, not two).
    const chartStart = new Date(ninetyDaysAgo.getFullYear(), ninetyDaysAgo.getMonth(), 1);
    const chartStartStr = normalizeDateToYMD(chartStart)!;

    const countyCondition = normalizedCounty
        ? (or(
              sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
              sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
          ) as any)
        : undefined;

    const sellerCountQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            and(
                eq(propertyTransactions.sellerId, id),
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                gte(propertyTransactions.recordingDate, ytdStartStr),
                lte(propertyTransactions.recordingDate, todayStr),
                ...(countyCondition ? [countyCondition] : []),
            ),
        );

    const sellerCountAllTimeQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        .where(
            and(
                eq(propertyTransactions.sellerId, id),
                sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                ...(countyCondition ? [countyCondition] : []),
            ),
        );

    const [[sellerCountResult], [sellerCountAllTimeResult]] = await Promise.all([
        sellerCountQuery,
        sellerCountAllTimeQuery,
    ]);

    let propertyCount: number;
    if (normalizedCounty) {
        const [propertyCountResult] = await db
            .select({ count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int` })
            .from(propertyTransactions)
            .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                and(
                    sql`${propertyTransactions.sortOrder} = 1`,
                    eq(propertyTransactions.buyerId, id),
                    or(
                        sql`LOWER(TRIM(${properties.county})) = ${normalizedCounty}`,
                        sql`LOWER(TRIM(${addresses.county})) = ${normalizedCounty}`,
                    ) as any,
                ),
            );
        propertyCount = propertyCountResult?.count ?? 0;
    } else {
        const [propertyCountResult] = await db
            .select({ count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int` })
            .from(propertyTransactions)
            .where(
                and(
                    sql`${propertyTransactions.sortOrder} = 1`,
                    eq(propertyTransactions.buyerId, id),
                ),
            );
        propertyCount = propertyCountResult?.count ?? 0;
    }

    const [chartAcquisitions, contactsList, assignedCountRows] = await Promise.all([
        // Powers BOTH the bar graph and the 90-day total: every acquisition from the
        // start of the earliest displayed month through today. A superset of the 90-day
        // window, which is recovered by filtering this result below.
        db
            .select({ recordingDate: propertyTransactions.recordingDate })
            .from(propertyTransactions)
            .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                and(
                    eq(propertyTransactions.buyerId, id),
                    gte(propertyTransactions.recordingDate, chartStartStr),
                    lte(propertyTransactions.recordingDate, todayStr),
                    ...(countyCondition ? [countyCondition] : []),
                ),
            ),
        db
            .select()
            .from(companyContacts)
            .where(eq(companyContacts.companyId, id))
            .orderBy(companyContacts.sortOrder, companyContacts.id),
        // Distinct properties this company assigned (is the assignor on the sale row).
        db
            .select({ count: sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int` })
            .from(propertyTransactions)
            .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .where(
                and(
                    eq(propertyTransactions.assignorId, id),
                    ...(countyCondition ? [countyCondition] : []),
                ),
            ),
    ]);

    const propertiesAssignedCount = assignedCountRows[0]?.count ?? 0;

    const primaryContact = contactsList[0] ?? null;

    const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const months: { key: string; count: number }[] = [];
    const cursor = new Date(ninetyDaysAgo.getFullYear(), ninetyDaysAgo.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= endMonth) {
        months.push({ key: monthNames[cursor.getMonth()], count: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    // One pass over the chart superset: tally each FULL month for the bar graph, and
    // separately count only the rows inside the strict 90-day window for the total.
    let acquisition90DayTotal = 0;
    chartAcquisitions.forEach((row) => {
        const dateStr = normalizeDateToYMD(row.recordingDate as string | Date | null);
        if (!dateStr) return;
        const [, m] = dateStr.split('-').map(Number);
        const monthKey = monthNames[m - 1];
        const existing = months.find((mo) => mo.key === monthKey);
        if (existing) existing.count++;
        if (dateStr >= ninetyDaysAgoStr) acquisition90DayTotal++;
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
        propertiesAssignedCount,
        acquisition90DayTotal,
        acquisition90DayByMonth: months,
    };
}

// ─── Update ───────────────────────────────────────────────────────────────────

type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

type UpdateCompanyResult =
    | { status: 'ok'; company: typeof companies.$inferSelect }
    | { status: 'not-found' }
    | { status: 'duplicate-name' };

export async function updateCompany(
    id: string,
    data: UpdateCompanyInput,
): Promise<UpdateCompanyResult> {
    const existing = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (existing.length === 0) return { status: 'not-found' };

    const updateFields: any = {};
    if (data.isArvClient !== undefined) updateFields.isArvClient = data.isArvClient;
    updateFields.updatedAt = new Date();

    const [updatedContact] = await db
        .update(companies)
        .set(updateFields)
        .where(eq(companies.id, id))
        .returning();

    console.log(`Updated company: ${updatedContact.companyName} (ID: ${id})`);
    return { status: 'ok', company: updatedContact };
}

// ─── Company Contacts ─────────────────────────────────────────────────────────

type AddContactInput = z.infer<typeof insertCompanyContactSchema>;
type UpdateContactInput = z.infer<typeof updateCompanyContactSchema>;

type ContactMutationResult =
    | { status: 'ok'; contact: typeof companyContacts.$inferSelect }
    | { status: 'company-not-found' }
    | { status: 'contact-not-found' };

export async function addContact(
    companyId: string,
    data: AddContactInput,
): Promise<ContactMutationResult> {
    const existing = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    if (existing.length === 0) return { status: 'company-not-found' };

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
    return { status: 'ok', contact: inserted };
}

export async function updateContact(
    companyId: string,
    contactId: number,
    data: UpdateContactInput,
): Promise<ContactMutationResult> {
    const existing = await db
        .select()
        .from(companyContacts)
        .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)))
        .limit(1);
    if (existing.length === 0) return { status: 'contact-not-found' };

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
    return { status: 'ok', contact: updated };
}

type DeleteContactResult = { status: 'ok' } | { status: 'contact-not-found' };

export async function deleteContact(
    companyId: string,
    contactId: number,
): Promise<DeleteContactResult> {
    const deleted = await db
        .delete(companyContacts)
        .where(and(eq(companyContacts.id, contactId), eq(companyContacts.companyId, companyId)))
        .returning({ id: companyContacts.id });

    if (deleted.length === 0) return { status: 'contact-not-found' };
    console.log(`Deleted contact ${contactId} from company ${companyId}`);
    return { status: 'ok' };
}

// ─── Enrich (OpenCorporates) ──────────────────────────────────────────────────

const STATE_TO_JURISDICTION: Record<string, string> = {
    CA: 'us_ca',
    FL: 'us_fl',
    CO: 'us_co',
    WA: 'us_wa',
};

function normalizeCompanyName(name: string): string {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitOfficerName(name: string): { firstName: string; lastName: string | null } {
    const idx = name.indexOf(' ');
    if (idx === -1) return { firstName: name, lastName: null };
    return { firstName: name.substring(0, idx), lastName: name.substring(idx + 1) };
}

function formatAgentAddress(addr: {
    street_address: string | null;
    locality: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
}): string {
    return [addr.street_address, addr.locality, addr.region, addr.postal_code, addr.country]
        .filter(Boolean)
        .join(', ');
}

type EnrichCompanyResult =
    | { status: 'ok' }
    | { status: 'not-found' }
    | { status: 'unknown-jurisdiction'; state: string }
    | { status: 'no-match'; companyName: string; jurisdiction: string }
    | { status: 'oc-error'; message: string };

export async function enrichCompany(id: string, state: string): Promise<EnrichCompanyResult> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!company) return { status: 'not-found' };

    const jurisdictionCode = STATE_TO_JURISDICTION[state.toUpperCase()];
    if (!jurisdictionCode) return { status: 'unknown-jurisdiction', state };

    const normalizedTarget = normalizeCompanyName(company.companyName);

    let searchResults: Awaited<ReturnType<typeof OpenCorporatesService.searchCompany>>;
    try {
        searchResults = await OpenCorporatesService.searchCompany(
            company.companyName,
            jurisdictionCode,
        );
    } catch (err) {
        return {
            status: 'oc-error',
            message: err instanceof Error ? err.message : 'Search request failed',
        };
    }

    const checkCount = Math.min(3, searchResults.totalCount, searchResults.companies.length);
    let matchedNumber: string | null = null;
    let matchedJurisdiction: string | null = null;
    for (let i = 0; i < checkCount; i++) {
        const result = searchResults.companies[i].company;
        if (normalizeCompanyName(result.name) === normalizedTarget) {
            matchedNumber = result.company_number;
            matchedJurisdiction = result.jurisdiction_code;
            break;
        }
    }

    if (!matchedNumber || !matchedJurisdiction) {
        return {
            status: 'no-match',
            companyName: company.companyName,
            jurisdiction: jurisdictionCode,
        };
    }

    let ocCompany: Awaited<ReturnType<typeof OpenCorporatesService.getCompanyByNumber>>;
    try {
        ocCompany = await OpenCorporatesService.getCompanyByNumber(
            matchedJurisdiction,
            matchedNumber,
        );
    } catch (err) {
        return {
            status: 'oc-error',
            message: err instanceof Error ? err.message : 'Company lookup failed',
        };
    }

    // Upsert company_details
    const detailValues = {
        companyId: id,
        jurisdictionCode: ocCompany.jurisdiction_code,
        ocCompanyNumber: ocCompany.company_number,
        incorporationDate: ocCompany.incorporation_date ?? null,
        dissolutionDate: ocCompany.dissolution_date ?? null,
        companyType: ocCompany.company_type ?? null,
        registryUrl: ocCompany.registry_url ?? null,
        branch: ocCompany.branch ?? null,
        branchStatus: ocCompany.branch_status ?? null,
        inactive: ocCompany.inactive ?? false,
        sourceName: ocCompany.source?.publisher ?? null,
        sourceUrl: ocCompany.source?.url ?? null,
        agentName: ocCompany.agent_name ?? null,
        agentAddress: ocCompany.agent_address ? formatAgentAddress(ocCompany.agent_address) : null,
        alternativeNames: ocCompany.alternative_names?.length ? ocCompany.alternative_names : null,
        previousNames: ocCompany.previous_names?.length ? ocCompany.previous_names : null,
        numberOfEmployees: ocCompany.number_of_employees ?? null,
        nativeCompanyNumber: ocCompany.native_company_number ?? null,
        alternateRegistrationEntities: ocCompany.alternate_registration_entities?.length
            ? ocCompany.alternate_registration_entities
            : null,
        previousRegistrationEntities: ocCompany.previous_registration_entities?.length
            ? ocCompany.previous_registration_entities
            : null,
        subsequentRegistrationEntities: ocCompany.subsequent_registration_entities?.length
            ? ocCompany.subsequent_registration_entities
            : null,
        industryCodes: ocCompany.industry_codes?.length ? ocCompany.industry_codes : null,
        identifiers: ocCompany.identifiers?.length ? ocCompany.identifiers : null,
        trademarkRegistrations: ocCompany.trademark_registrations?.length
            ? ocCompany.trademark_registrations
            : null,
        corporateGroupings: ocCompany.corporate_groupings?.length
            ? ocCompany.corporate_groupings
            : null,
        financialSummary:
            ocCompany.financial_summary != null
                ? JSON.stringify(ocCompany.financial_summary)
                : null,
        homeCompany: ocCompany.home_company != null ? JSON.stringify(ocCompany.home_company) : null,
        controllingEntity:
            ocCompany.controlling_entity != null
                ? JSON.stringify(ocCompany.controlling_entity)
                : null,
        ultimateBeneficialOwners: ocCompany.ultimate_beneficial_owners?.length
            ? ocCompany.ultimate_beneficial_owners
            : null,
        ultimateControllingCompany:
            ocCompany.ultimate_controlling_company != null
                ? JSON.stringify(ocCompany.ultimate_controlling_company)
                : null,
        filings: ocCompany.filings?.length ? ocCompany.filings : null,
        enrichedAt: new Date(),
        updatedAt: new Date(),
    };

    await db.insert(companyDetails).values(detailValues).onConflictDoUpdate({
        target: companyDetails.companyId,
        set: detailValues,
    });

    // Replace all addresses for this company
    await db.delete(companyAddresses).where(eq(companyAddresses.companyId, id));

    const addressRows: (typeof companyAddresses.$inferInsert)[] = [];

    if (ocCompany.registered_address) {
        addressRows.push({
            companyId: id,
            addressType: 'registered',
            streetAddress: ocCompany.registered_address.street_address ?? null,
            locality: ocCompany.registered_address.locality ?? null,
            region: ocCompany.registered_address.region ?? null,
            postalCode: ocCompany.registered_address.postal_code ?? null,
            country: ocCompany.registered_address.country ?? null,
            addressInFull: ocCompany.registered_address_in_full ?? null,
        });
    }

    for (const { datum } of ocCompany.data?.most_recent ?? []) {
        if (datum.title === 'Mailing Address') {
            addressRows.push({
                companyId: id,
                addressType: 'mailing',
                streetAddress: null,
                locality: null,
                region: null,
                postalCode: null,
                country: null,
                addressInFull: datum.description,
            });
        } else if (datum.title === 'Head Office Address') {
            addressRows.push({
                companyId: id,
                addressType: 'head_office',
                streetAddress: null,
                locality: null,
                region: null,
                postalCode: null,
                country: null,
                addressInFull: datum.description,
            });
        }
    }

    if (addressRows.length > 0) {
        await db.insert(companyAddresses).values(addressRows);
    }

    // Upsert officers as contacts (query-based to handle nullable last_name).
    // OC returns officers oldest-first, so reverse to process newest first and assign lower sort orders to more recent officers.
    // Skip registered agents (position: "agent") — they are not useful contacts.
    const officers = [...(ocCompany.officers ?? [])].reverse();
    for (const { officer } of officers) {
        if (officer.position === 'agent') continue;
        const { firstName, lastName } = splitOfficerName(officer.name);

        const lastNameCondition = lastName
            ? sql`LOWER(TRIM(COALESCE(${companyContacts.lastName}, ''))) = LOWER(TRIM(${lastName}))`
            : sql`${companyContacts.lastName} IS NULL`;

        const [existing] = await db
            .select({ id: companyContacts.id })
            .from(companyContacts)
            .where(
                and(
                    eq(companyContacts.companyId, id),
                    sql`LOWER(TRIM(${companyContacts.firstName})) = LOWER(TRIM(${firstName}))`,
                    lastNameCondition,
                ),
            )
            .limit(1);

        if (existing) {
            await db
                .update(companyContacts)
                .set({
                    title: officer.position ?? null,
                    address: officer.address ?? null,
                    updatedAt: new Date(),
                })
                .where(eq(companyContacts.id, existing.id));
        } else {
            const [{ nextSortOrder }] = await db
                .select({
                    nextSortOrder: sql<number>`COALESCE(MAX(${companyContacts.sortOrder}), 0) + 1`,
                })
                .from(companyContacts)
                .where(eq(companyContacts.companyId, id));

            await db.insert(companyContacts).values({
                companyId: id,
                firstName,
                lastName: lastName ?? null,
                title: officer.position ?? null,
                address: officer.address ?? null,
                sortOrder: nextSortOrder ?? 1,
            });
        }
    }

    console.log(`Enriched company ${company.companyName} (ID: ${id}) from OpenCorporates`);
    return { status: 'ok' };
}
