import { getPropertyTransactions } from 'server/services/properties/propertyTransactions.services';
import { getCompanyGroupNotificationTarget } from 'server/services/groups/groups.services';
import { isArmsLength, sortTransactionsDesc } from 'server/utils/orderTransactions';

/**
 * The current owner of a matched property and whether we have anyone to email about it.
 *
 * A discriminated union on `isNotifiable`: when `true`, `ownerCompanyId` is guaranteed non-null (a
 * company in a group with at least one member), so the NOTIFY caller gets a `string` without a null
 * check. Recipients resolve through the owner's operator group (#93), so the reach is group-wide.
 */
export type OwnerResolution =
    | {
          /** True only when the owner is in an operator group that has at least one member to notify. */
          isNotifiable: true;
          /** Owning company id — the buyer of the most-recent arms-length tx. */
          ownerCompanyId: string;
          /** Snapshot of the owner's name at match time. */
          ownerName: string | null;
          /** User ids of the owner's group members (≥ 1) — reused by NOTIFY so it needn't re-query. */
          memberUserIds: string[];
      }
    | {
          isNotifiable: false;
          /** Null for an individual/unlinked owner; set but not-notifiable for an ungrouped/member-less company. */
          ownerCompanyId: string | null;
          ownerName: string | null;
      };

/**
 * Resolve a matched property's current owner and whether it's notifiable (§4.4).
 *
 * Uses the Data app's canonical owner logic — `sortTransactionsDesc` (recording_date DESC, with
 * same-day ownership-chain reconstruction) — to find the most-recent arms-length transaction, whose
 * buyer is the current owning company. We deliberately do NOT trust `getPropertyTransactions`'
 * stored `sort_order`: user-appended transactions (`insertAtEnd`) leave sort_order out of recency
 * order, so trusting it would resolve a stale owner and alert the wrong company. A row with only a
 * `buyerName` (no `buyerId`) is an individual/unlinked owner: stored, never emailed.
 *
 * Notifiability resolves through the owner's operator group (#93): an ungrouped company, or a group
 * with no members, is stored but not emailed (nobody to tell). Every group with members is notified
 * — there is no per-group opt-out.
 *
 * @param propertyId the matched property
 * @returns the owning company id/name and whether at least one group member can be notified
 */
export async function resolveOwner(propertyId: string): Promise<OwnerResolution> {
    const transactions = await getPropertyTransactions(propertyId);
    const latestArmsLength = sortTransactionsDesc(transactions).find((tx) => isArmsLength(tx));

    const ownerCompanyId = latestArmsLength?.buyerId ?? null;
    const ownerName = latestArmsLength?.buyerName ?? null;

    if (ownerCompanyId) {
        const target = await getCompanyGroupNotificationTarget(ownerCompanyId);
        if (target && target.memberUserIds.length > 0) {
            return {
                isNotifiable: true,
                ownerCompanyId,
                ownerName,
                memberUserIds: target.memberUserIds,
            };
        }
    }

    return { isNotifiable: false, ownerCompanyId, ownerName };
}
