import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { properties } from '@database/schemas/properties.schema';

/**
 * Builds the `EXISTS (...)` clause that matches a property where a company is
 * involved on a sale. A company is "involved" when it is the buyer/seller on an
 * Arms Length transaction, or — when no role is pinned — the assignor on any sale.
 *
 * The assignor is a distinct role, so it is only folded in for the unrestricted
 * "any involvement" case (no `companyRole`); pinning buyer/seller excludes it.
 *
 * This lives in one place so the list (getProperties), map (getMapProperties),
 * and zip-count (getZipCounts) queries share identical assignor semantics and
 * cannot silently diverge.
 *
 * @param companyId trimmed company UUID to match
 * @param companyRole optional 'buyer' | 'seller' to restrict the sale side
 */
export function companyInvolvementExists(companyId: string, companyRole?: string): SQL {
    const salePart =
        companyRole === 'buyer'
            ? sql`pt.buyer_id = ${companyId}::uuid`
            : companyRole === 'seller'
              ? sql`pt.seller_id = ${companyId}::uuid`
              : sql`(pt.buyer_id = ${companyId}::uuid OR pt.seller_id = ${companyId}::uuid)`;

    const involvement = companyRole
        ? sql`LOWER(TRIM(pt.transaction_type)) = 'arms length' AND ${salePart}`
        : sql`(LOWER(TRIM(pt.transaction_type)) = 'arms length' AND ${salePart}) OR pt.assignor_id = ${companyId}::uuid`;

    return sql`EXISTS (
        SELECT 1 FROM property_transactions pt
        WHERE pt.property_id = ${properties.id}
        AND (${involvement})
    )`;
}
