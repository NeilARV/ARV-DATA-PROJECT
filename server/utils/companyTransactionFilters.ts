import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { properties } from '@database/schemas/properties.schema';

/**
 * What a transaction-involvement filter matches against: a single company, or every member
 * company of an operator group (resolved to its id-set inside the SQL, so a disbanded or
 * empty group simply matches nothing).
 */
export type InvolvementTarget = { companyId: string } | { groupId: string };

/**
 * Resolves the companyId/groupId query params to one involvement target, or null when neither
 * is present. The company param wins when both are supplied (mirrors the client's URL precedence).
 */
export function resolveInvolvementTarget(
    companyId?: string,
    groupId?: string,
): InvolvementTarget | null {
    const companyIdTrimmed = typeof companyId === 'string' ? companyId.trim() : '';
    if (companyIdTrimmed !== '') return { companyId: companyIdTrimmed };
    const groupIdTrimmed = typeof groupId === 'string' ? groupId.trim() : '';
    if (groupIdTrimmed !== '') return { groupId: groupIdTrimmed };
    return null;
}

/**
 * Matches a `pt.<column>` party id against the target: equality for a company, membership in the
 * group's company id-set for a group. Shared by the involvement predicate and the map pin
 * tx-info subquery so both resolve group membership identically.
 */
export function involvedPartyMatches(
    column: 'buyer_id' | 'seller_id' | 'assignor_id',
    target: InvolvementTarget,
): SQL {
    if ('companyId' in target) {
        return sql`pt.${sql.raw(column)} = ${target.companyId}::uuid`;
    }
    return sql`pt.${sql.raw(column)} IN (SELECT c.id FROM companies c WHERE c.group_id = ${target.groupId}::uuid)`;
}

/**
 * Builds the `EXISTS (...)` clause that matches a property where the target (a company, or any
 * member company of a group) is involved on a sale. A party is "involved" when it is the
 * buyer/seller on an Arms Length transaction, or — when no role is pinned — the assignor on any
 * sale.
 *
 * The assignor is a distinct role, so it is only folded in for the unrestricted
 * "any involvement" case (no `companyRole`); pinning buyer/seller excludes it.
 *
 * This lives in one place so the list (getProperties), map (getMapProperties),
 * and zip-count (getZipCounts) queries share identical assignor + group-membership
 * semantics and cannot silently diverge.
 *
 * @param target the company or group to match (see InvolvementTarget)
 * @param companyRole optional 'buyer' | 'seller' to restrict the sale side
 */
export function companyInvolvementExists(target: InvolvementTarget, companyRole?: string): SQL {
    const salePart =
        companyRole === 'buyer'
            ? involvedPartyMatches('buyer_id', target)
            : companyRole === 'seller'
              ? involvedPartyMatches('seller_id', target)
              : sql`(${involvedPartyMatches('buyer_id', target)} OR ${involvedPartyMatches('seller_id', target)})`;

    const involvement = companyRole
        ? sql`LOWER(TRIM(pt.transaction_type)) = 'arms length' AND ${salePart}`
        : sql`(LOWER(TRIM(pt.transaction_type)) = 'arms length' AND ${salePart}) OR ${involvedPartyMatches('assignor_id', target)}`;

    return sql`EXISTS (
        SELECT 1 FROM property_transactions pt
        WHERE pt.property_id = ${properties.id}
        AND (${involvement})
    )`;
}
