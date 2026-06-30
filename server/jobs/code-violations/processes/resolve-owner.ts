import { getPropertyTransactions } from 'server/services/properties/propertyTransactions.services';
import { getCompanyMembers } from 'server/services/claims/claims.services';

/** The current owner of a matched property and whether we have anyone to email about it. */
export interface OwnerResolution {
    /** Owning company id (the buyer of the most-recent arms-length tx), or null for an individual/unlinked owner. */
    ownerCompanyId: string | null;
    /** Snapshot of the owner's name at match time (company or individual). */
    ownerName: string | null;
    /** True only when the owner is a company that has at least one platform user to notify. */
    isNotifiable: boolean;
}

/** A transaction is "arms length" when its type, trimmed and lowercased, equals `'arms length'`. */
function isArmsLength(type: string | null): boolean {
    return (type ?? '').trim().toLowerCase() === 'arms length';
}

/**
 * Resolve a matched property's current owner and whether it's notifiable (§4.4).
 *
 * Reuses the Data app's transaction-resolution logic — `getPropertyTransactions` returns the rows
 * ordered by `sort_order` ascending (1 = most recent), and the consumer that wrote that ordering is
 * trustworthy — so the **first** arms-length transaction is the most recent one, and its buyer is the
 * current owning company. A row with only a `buyerName` (no `buyerId`) is an individual/unlinked
 * owner: stored, never emailed. A company with no `company_members` is stored but not emailed (nobody
 * to tell yet) — note we gate on **`company_members`**, never `company_contacts`.
 *
 * @param propertyId the matched property
 * @returns the owning company id/name and whether at least one user can be notified
 */
export async function resolveOwner(propertyId: string): Promise<OwnerResolution> {
    const transactions = await getPropertyTransactions(propertyId);
    const latestArmsLength = transactions.find((tx) => isArmsLength(tx.transactionType));

    const ownerCompanyId = latestArmsLength?.buyerId ?? null;
    const ownerName = latestArmsLength?.buyerName ?? null;

    let isNotifiable = false;
    if (ownerCompanyId) {
        const members = await getCompanyMembers(ownerCompanyId);
        isNotifiable = members.length > 0;
    }

    return { ownerCompanyId, ownerName, isNotifiable };
}
