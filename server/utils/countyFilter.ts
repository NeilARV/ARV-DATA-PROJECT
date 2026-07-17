import { sql, or } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { properties, addresses } from '@database/schemas/properties.schema';
import { filterCountiesToMsa } from '@shared/constants/countyToMsa';

type CountyScopeParams = {
    county?: string | string[];
    msa?: string | string[];
    /** County columns the filter matches against (OR across them). */
    columns?: [AnyColumn, ...AnyColumn[]];
};

/**
 * WHERE condition matching the county filter against the given county columns (by default
 * properties.county / addresses.county).
 * With `msa`, the counties are intersected with that MSA's tracked counties (COUNTY_TO_MSA),
 * so the match can never cross the MSA — and an empty selection or empty intersection matches
 * no rows. Without `msa`, the counties apply as given (legacy single-county callers).
 * @returns the condition, or null when no county filtering applies
 */
export function countyScopeCondition({
    county,
    msa,
    columns = [properties.county, addresses.county],
}: CountyScopeParams): SQL | null {
    const requested = (Array.isArray(county) ? county : county ? [county] : []).filter(
        (c) => c.trim() !== '',
    );
    // A repeated msa param is malformed; the picker sends exactly one — take the first.
    const msaName = Array.isArray(msa) ? msa[0] : msa;

    let effective: string[];
    if (msaName) {
        effective = filterCountiesToMsa(msaName, requested);
        // One-MSA-at-a-time contract: no (valid) counties selected shows no properties.
        if (effective.length === 0) return sql`FALSE`;
    } else {
        if (requested.length === 0) return null;
        effective = requested;
    }

    const list = sql.join(
        effective.map((c) => sql`${c.trim().toLowerCase()}`),
        sql`, `,
    );
    return or(...columns.map((column) => sql`LOWER(TRIM(${column})) IN (${list})`)) ?? null;
}
