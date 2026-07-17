import { db } from 'server/storage';
import { companies, companyGroups } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { sql, eq, and, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { clampLimit } from 'server/utils/clampLimit';
import { countyScopeCondition } from 'server/utils/countyFilter';
import { normalizeDateToYMD } from 'server/utils/normalization';
import { buildSortCountSpec, SORT_COUNT_FIELD } from './sortCounts';
import type { CountedSortOption } from './sortCounts';
import type { GroupDirectoryRow } from '@shared/types/groups';

export const GROUP_DIRECTORY_PAGE_SIZE = 50;

// The groups directory supports every counted directory sort (everything but `new-buyers`, whose
// creation-date order has no group-level meaning); anything else falls back to most-properties,
// mirroring getContacts. Derived from SORT_COUNT_FIELD so the set is defined in exactly one place.
export const GROUP_DIRECTORY_SORT_OPTIONS = Object.keys(SORT_COUNT_FIELD) as CountedSortOption[];

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
): Promise<CandidateGroup[]> {
    const conditions: SQL[] = [];
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
    const sortOption = (GROUP_DIRECTORY_SORT_OPTIONS as readonly string[]).includes(sort)
        ? (sort as CountedSortOption)
        : 'most-properties';
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
