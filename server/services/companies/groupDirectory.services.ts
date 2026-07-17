import { db } from 'server/storage';
import { companies, companyGroups } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { sql, eq, and, gte, lte, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { clampLimit } from 'server/utils/clampLimit';
import { countyScopeCondition } from 'server/utils/countyFilter';
import { normalizeDateToYMD } from 'server/utils/normalization';
import { buildSortCountSpec, SORT_COUNT_FIELD } from './sortCounts';
import { buildAcquisitionWindow, tallyAcquisitionChart } from './acquisitionChart';
import type { CountedSortOption } from './sortCounts';
import type { GroupDirectoryRow, GroupProfile, GroupMemberCount } from '@shared/types/groups';

export const GROUP_DIRECTORY_PAGE_SIZE = 50;

// The groups directory supports every counted directory sort (everything but `new-buyers`, whose
// creation-date order has no group-level meaning); anything else falls back to most-properties,
// mirroring getContacts. Derived from SORT_COUNT_FIELD so the set is defined in exactly one place.
export const GROUP_DIRECTORY_SORT_OPTIONS = Object.keys(SORT_COUNT_FIELD) as CountedSortOption[];

/** Resolves a raw sort param to a counted directory sort; invalid/`new-buyers`/absent → most-properties. */
function resolveGroupSort(sort: string | undefined): CountedSortOption {
    return (GROUP_DIRECTORY_SORT_OPTIONS as readonly string[]).includes(sort ?? '')
        ? (sort as CountedSortOption)
        : 'most-properties';
}

interface GetGroupDirectoryParams {
    county?: string | string[];
    page?: string;
    limit?: string;
    sort?: string;
    search?: string;
}

interface GetGroupDirectoryResult {
    groups: GroupDirectoryRow[];
    total: number;
    page: number;
    limit: number;
}

/**
 * EXISTS clause matching a company_groups row with at least one member company tagged
 * (company_counties) with any of the counties; null when no county filter applies. The two-or-more
 * gate is global, so this only narrows visibility — it never changes a group's companyCount.
 */
function groupCountyExists(county: string | string[] | undefined): SQL | null {
    const counties = (Array.isArray(county) ? county : county ? [county] : [])
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c !== '');
    if (counties.length === 0) return null;
    const list = sql.join(
        counties.map((c) => sql`${c}`),
        sql`, `,
    );
    return sql`EXISTS (
        SELECT 1 FROM companies gc
        JOIN company_counties cc ON cc.company_id = gc.id
        WHERE gc.group_id = ${companyGroups.id}
        AND LOWER(cc.county) IN (${list})
    )`;
}

type CandidateGroup = { id: string; name: string; companyCount: number };

/**
 * Multi-company groups (2+ members, evaluated globally) optionally narrowed to a county and a
 * search matching the group name or any member company name. Auto-created singleton groups (one
 * company) are excluded by the >= 2 HAVING gate.
 */
async function fetchCandidateGroups(
    county: string | string[] | undefined,
    searchTerm: string,
    id?: string,
): Promise<CandidateGroup[]> {
    const conditions: SQL[] = [];
    if (id) {
        conditions.push(eq(companyGroups.id, id));
    }
    if (searchTerm.length >= 2) {
        const pattern = `%${searchTerm.toLowerCase()}%`;
        // Users know operators by either the group name or a member LLC, so match both. The EXISTS
        // is aliased (mc) so it scans all members rather than filtering the joined member rows,
        // which would skew companyCount and the two-or-more gate.
        conditions.push(sql`(
            LOWER(TRIM(${companyGroups.name})) LIKE ${pattern}
            OR EXISTS (
                SELECT 1 FROM companies mc
                WHERE mc.group_id = ${companyGroups.id}
                AND LOWER(TRIM(mc.company)) LIKE ${pattern}
            )
        )`);
    }
    const countyClause = groupCountyExists(county);
    if (countyClause) conditions.push(countyClause);

    const rows = await db
        .select({
            id: companyGroups.id,
            name: companyGroups.name,
            companyCount: sql<number>`count(${companies.id})::int`,
        })
        .from(companyGroups)
        .innerJoin(companies, eq(companies.groupId, companyGroups.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(companyGroups.id, companyGroups.name)
        .having(sql`count(${companies.id}) >= 2`);
    return rows as CandidateGroup[];
}

/**
 * Aggregate count per candidate group: the sort's count query grouped by the buyer/seller company's
 * group id. DISTINCT sorts de-dup a property touched by two members; intra-group transfers count.
 * County-scoped on the transaction's location, exactly as the company directory scopes it.
 */
async function fetchGroupSortCounts(
    sort: CountedSortOption,
    candidateGroupIds: string[],
    county: string | string[] | undefined,
    dates: { ytdStartStr: string; todayStr: string },
): Promise<Map<string, number>> {
    const spec = buildSortCountSpec(sort, dates);
    const parts: SQL[] = [...spec.whereParts];
    const countyCondition = countyScopeCondition({ county });
    if (countyCondition) parts.push(countyCondition);
    parts.push(inArray(companies.groupId, candidateGroupIds));

    const countExpr = spec.distinct
        ? sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`
        : sql<number>`count(*)::int`;

    const rows = (await db
        .select({ id: companies.groupId, count: countExpr })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        // Resolve each transaction's buyer/seller company to its group.
        .innerJoin(companies, eq(companies.id, spec.roleColumn))
        .where(and(...parts))
        .groupBy(companies.groupId)) as { id: string | null; count: number }[];

    const map = new Map<string, number>();
    rows.forEach((row) => {
        if (row.id) map.set(row.id, row.count);
    });
    return map;
}

/**
 * Per-member count for one sort: the sort's count query grouped by the member company's id, scoped
 * to the group and (optionally) the county. Members absent from the returned map have no activity
 * for the sort in scope. The company-grain twin of fetchGroupSortCounts.
 */
async function fetchGroupMemberSortCounts(
    sort: CountedSortOption,
    groupId: string,
    county: string | string[] | undefined,
    dates: { ytdStartStr: string; todayStr: string },
): Promise<Map<string, number>> {
    const spec = buildSortCountSpec(sort, dates);
    const parts: SQL[] = [...spec.whereParts];
    const countyCondition = countyScopeCondition({ county });
    if (countyCondition) parts.push(countyCondition);
    parts.push(eq(companies.groupId, groupId));

    const countExpr = spec.distinct
        ? sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`
        : sql<number>`count(*)::int`;

    const rows = (await db
        .select({ id: companies.id, count: countExpr })
        .from(propertyTransactions)
        .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
        .leftJoin(addresses, eq(properties.id, addresses.propertyId))
        // Resolve each transaction's buyer/seller company (the member itself).
        .innerJoin(companies, eq(companies.id, spec.roleColumn))
        .where(and(...parts))
        .groupBy(companies.id)) as { id: string; count: number }[];

    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.id, row.count));
    return map;
}

/**
 * The See Companies roster: every member company of the group with its count for the requested sort
 * (county-scoped), most-active first; members with no activity for the sort sort last with a zero
 * count. All members are listed regardless of county so the operator's legal entities are complete;
 * only the counts are county-scoped. Sort resolves to the counted set (invalid/new-buyers →
 * most-properties), mirroring the directory.
 */
async function buildGroupRoster(
    groupId: string,
    county: string | string[] | undefined,
    sort: string,
    dates: { ytdStartStr: string; todayStr: string },
): Promise<GroupMemberCount[]> {
    const sortOption = resolveGroupSort(sort);

    const [members, countMap] = await Promise.all([
        db
            .select({ id: companies.id, name: companies.companyName })
            .from(companies)
            .where(eq(companies.groupId, groupId)),
        fetchGroupMemberSortCounts(sortOption, groupId, county, dates),
    ]);

    return members
        .map((m) => ({ companyId: m.id, companyName: m.name, count: countMap.get(m.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.companyName.localeCompare(b.companyName));
}

/**
 * One page of the public Groups directory: multi-company operator groups ranked by the active sort,
 * scoped to the selected county, with zero-count groups hidden. Mirrors the company directory's
 * sort/search/county/pagination contract; group names are returned RAW.
 */
export async function getGroupDirectory(
    params: GetGroupDirectoryParams,
): Promise<GetGroupDirectoryResult> {
    const {
        county,
        page = '1',
        limit = String(GROUP_DIRECTORY_PAGE_SIZE),
        sort = 'most-properties',
        search,
    } = params;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = clampLimit(limit, { fallback: GROUP_DIRECTORY_PAGE_SIZE, max: 100 });
    const sortOption = resolveGroupSort(sort);
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    const candidates = await fetchCandidateGroups(county, searchTerm);
    if (candidates.length === 0) {
        return { groups: [], total: 0, page: pageNum, limit: limitNum };
    }

    const now = new Date();
    const dates = { ytdStartStr: `${now.getFullYear()}-01-01`, todayStr: normalizeDateToYMD(now)! };
    const countMap = await fetchGroupSortCounts(
        sortOption,
        candidates.map((c) => c.id),
        county,
        dates,
    );

    const countField = SORT_COUNT_FIELD[sortOption] as keyof GroupDirectoryRow;
    const rows: GroupDirectoryRow[] = candidates
        .map((group) => ({
            id: group.id,
            name: group.name,
            companyCount: group.companyCount,
            propertyCount: 0,
            propertiesSoldCount: 0,
            propertiesSoldCountAllTime: 0,
            propertiesBoughtCount: 0,
            propertiesBoughtCountAllTime: 0,
            wholesaleBuyCount: 0,
            wholesalerCount: 0,
            [countField]: countMap.get(group.id) ?? 0,
        }))
        // Zero-count filter mirrors the company directory: hide groups with no activity for this sort.
        .filter((row) => (row[countField] as number) > 0);

    rows.sort((a, b) => (b[countField] as number) - (a[countField] as number));

    const total = rows.length;
    const offset = (pageNum - 1) * limitNum;
    const groupsPage = rows.slice(offset, offset + limitNum);

    return { groups: groupsPage, total, page: pageNum, limit: limitNum };
}

/**
 * One group's directory row under the same visibility rules as the directory (2+ members,
 * county-scoped, non-zero count for the sort), or null when the group is stale for this view —
 * disbanded, below two members, or without activity in the selected county. Backs ?group=
 * deep-link validation.
 */
export async function getGroupDirectoryRowById(
    id: string,
    params: { county?: string | string[]; sort?: string },
): Promise<GroupDirectoryRow | null> {
    const sortOption = resolveGroupSort(params.sort);

    const [candidate] = await fetchCandidateGroups(params.county, '', id);
    if (!candidate) return null;

    const now = new Date();
    const dates = { ytdStartStr: `${now.getFullYear()}-01-01`, todayStr: normalizeDateToYMD(now)! };
    const countMap = await fetchGroupSortCounts(sortOption, [candidate.id], params.county, dates);
    const count = countMap.get(candidate.id) ?? 0;
    // Mirrors the directory's zero-count filter: no activity for this sort in this county = stale.
    if (count <= 0) return null;

    const countField = SORT_COUNT_FIELD[sortOption] as keyof GroupDirectoryRow;
    return {
        id: candidate.id,
        name: candidate.name,
        companyCount: candidate.companyCount,
        propertyCount: 0,
        propertiesSoldCount: 0,
        propertiesSoldCountAllTime: 0,
        propertiesBoughtCount: 0,
        propertiesBoughtCountAllTime: 0,
        wholesaleBuyCount: 0,
        wholesalerCount: 0,
        [countField]: count,
    };
}

/**
 * Aggregate profile for one operator group (the expanded group card): the company-profile stats
 * summed across member companies — owned de-duplicated across members, YTD Arms-Length sold
 * including intra-group transfers, assigned de-duplicated on property, and the 90-day acquisition
 * chart. The stats are sort-independent; passing `sort` additionally attaches the on-demand See
 * Companies roster (member companies with per-member counts for that sort). Null under the directory
 * row's visibility rules: disbanded, under two members, or no member in the selected counties.
 */
export async function getGroupProfile(
    id: string,
    county?: string | string[],
    sort?: string,
): Promise<GroupProfile | null> {
    const [candidate] = await fetchCandidateGroups(county, '', id);
    if (!candidate) return null;

    const dateWindow = buildAcquisitionWindow();
    const countyCondition = countyScopeCondition({ county });

    // Each stat resolves its role column to the group through the member company's group_id, so a
    // transaction counts when EITHER member is on that side — the group-grain twin of getCompanyById.
    const memberStatQuery = (roleColumn: PgColumn, countExpr: SQL<number>, extraParts: SQL[]) =>
        db
            .select({ count: countExpr })
            .from(propertyTransactions)
            .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .innerJoin(companies, eq(companies.id, roleColumn))
            .where(
                and(
                    eq(companies.groupId, id),
                    ...extraParts,
                    ...(countyCondition ? [countyCondition] : []),
                ),
            );

    const distinctPropertyCount = sql<number>`count(DISTINCT ${propertyTransactions.propertyId})::int`;
    const rowCount = sql<number>`count(*)::int`;
    const armsLength = sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`;

    // The roster (per-member counts for the active sort) is served only on demand — when the See
    // Companies dialog requests the profile with a sort. Built alongside the stats.
    const rosterPromise: Promise<GroupMemberCount[] | undefined> =
        sort !== undefined
            ? buildGroupRoster(id, county, sort, dateWindow)
            : Promise.resolve(undefined);

    const [[owned], [soldYtd], [assigned], chartAcquisitions, roster] = await Promise.all([
        // Current owner: a member is the buyer on the most-recent (sort_order=1) transaction; a
        // property bought via two members counts once.
        memberStatQuery(propertyTransactions.buyerId, distinctPropertyCount, [
            sql`${propertyTransactions.sortOrder} = 1`,
        ]),
        // YTD sold counts transaction rows (not distinct), matching getCompanyById and the
        // directory's most-sold sort — intra-group transfers included.
        memberStatQuery(propertyTransactions.sellerId, rowCount, [
            armsLength,
            gte(propertyTransactions.recordingDate, dateWindow.ytdStartStr),
            lte(propertyTransactions.recordingDate, dateWindow.todayStr),
        ]),
        memberStatQuery(propertyTransactions.assignorId, distinctPropertyCount, []),
        // Chart superset: every member acquisition from the earliest displayed month through today;
        // the strict 90-day total is recovered in the tally.
        db
            .select({ recordingDate: propertyTransactions.recordingDate })
            .from(propertyTransactions)
            .innerJoin(properties, eq(propertyTransactions.propertyId, properties.id))
            .leftJoin(addresses, eq(properties.id, addresses.propertyId))
            .innerJoin(companies, eq(companies.id, propertyTransactions.buyerId))
            .where(
                and(
                    eq(companies.groupId, id),
                    gte(propertyTransactions.recordingDate, dateWindow.chartStartStr),
                    lte(propertyTransactions.recordingDate, dateWindow.todayStr),
                    ...(countyCondition ? [countyCondition] : []),
                ),
            ),
        rosterPromise,
    ]);

    const { acquisition90DayTotal, acquisition90DayByMonth } = tallyAcquisitionChart(
        chartAcquisitions,
        dateWindow,
    );

    return {
        id: candidate.id,
        name: candidate.name,
        companyCount: candidate.companyCount,
        propertyCount: owned?.count ?? 0,
        propertiesSoldCount: soldYtd?.count ?? 0,
        propertiesAssignedCount: assigned?.count ?? 0,
        acquisition90DayTotal,
        acquisition90DayByMonth,
        ...(roster !== undefined ? { roster } : {}),
    };
}
