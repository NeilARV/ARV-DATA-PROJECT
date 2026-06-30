import { getPropertyTransactions } from 'server/services/properties/propertyTransactions.services';
import { getCompanyMembers } from 'server/services/claims/claims.services';
import { isArmsLength } from 'server/utils/orderTransactions';

/**
 * The current owner of a matched property and whether we have anyone to email about it.
 *
 * A discriminated union on `isNotifiable`: when `true`, `ownerCompanyId` is guaranteed non-null (a
 * company with at least one member), so the NOTIFY caller gets a `string` without a null check.
 */
export type OwnerResolution =
    | {
          /** True only when the owner is a company that has at least one platform user to notify. */
          isNotifiable: true;
          /** Owning company id — the buyer of the most-recent arms-length tx. */
          ownerCompanyId: string;
          /** Snapshot of the owner's name at match time. */
          ownerName: string | null;
          /** User ids of the owning company's members (≥ 1) — reused by NOTIFY so it needn't re-query. */
          memberUserIds: string[];
      }
    | {
          isNotifiable: false;
          /** Null for an individual/unlinked owner; set but member-less for an unnotifiable company. */
          ownerCompanyId: string | null;
          ownerName: string | null;
      };

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
    const latestArmsLength = transactions.find((tx) => isArmsLength(tx));

    const ownerCompanyId = latestArmsLength?.buyerId ?? null;
    const ownerName = latestArmsLength?.buyerName ?? null;

    if (ownerCompanyId) {
        const members = await getCompanyMembers(ownerCompanyId);
        if (members.length > 0) {
            return {
                isNotifiable: true,
                ownerCompanyId,
                ownerName,
                memberUserIds: members.map((m) => m.userId),
            };
        }
    }

    return { isNotifiable: false, ownerCompanyId, ownerName };
}
