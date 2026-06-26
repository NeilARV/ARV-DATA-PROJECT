import { db } from 'server/storage';
import { propertyTransactions } from '@database/schemas/properties.schema';
import { companies, companyMembers } from '@database/schemas/companies.schema';
import { inArray, asc } from 'drizzle-orm';

// Resolve a matched property to the users we should alert: the most-recent (sortOrder = 1)
// transaction's buyer company → its company_members. Decision (locked): use the
// most-recent transaction's buyerId and SKIP if it is null (an unlinked buyer name is not
// resolvable). No company / no members → no recipients (stored, never alerted).

/** The owning company + alert recipients for one property. */
export interface OwnerResolution {
    companyId: string | null;
    companyName: string | null;
    userIds: string[];
}

const EMPTY: OwnerResolution = { companyId: null, companyName: null, userIds: [] };

/**
 * Batch-resolve owners for many properties at once (avoids N+1 in the pipeline).
 * @param propertyIds matched property ids
 * @returns a map from propertyId → its OwnerResolution (every input id is present)
 */
export async function resolveOwnersForProperties(
    propertyIds: string[],
): Promise<Map<string, OwnerResolution>> {
    const result = new Map<string, OwnerResolution>();
    const uniqueIds = Array.from(new Set(propertyIds));
    if (uniqueIds.length === 0) return result;

    // Most-recent transaction per property = lowest sort_order (NULLS LAST), matching the
    // sortTransactionsDesc/seed-sort-order convention. Take the first row seen per property.
    const txs = await db
        .select({
            propertyId: propertyTransactions.propertyId,
            buyerId: propertyTransactions.buyerId,
            buyerName: propertyTransactions.buyerName,
        })
        .from(propertyTransactions)
        .where(inArray(propertyTransactions.propertyId, uniqueIds))
        .orderBy(asc(propertyTransactions.sortOrder));

    const buyerByProperty = new Map<string, { buyerId: string | null; buyerName: string | null }>();
    for (const tx of txs) {
        if (!buyerByProperty.has(tx.propertyId)) {
            buyerByProperty.set(tx.propertyId, { buyerId: tx.buyerId, buyerName: tx.buyerName });
        }
    }

    const buyerIds = Array.from(
        new Set(
            Array.from(buyerByProperty.values())
                .map((b) => b.buyerId)
                .filter((id): id is string => id != null),
        ),
    );

    const membersByCompany = new Map<string, string[]>();
    const nameByCompany = new Map<string, string>();
    if (buyerIds.length > 0) {
        const [members, comps] = await Promise.all([
            db
                .select({ companyId: companyMembers.companyId, userId: companyMembers.userId })
                .from(companyMembers)
                .where(inArray(companyMembers.companyId, buyerIds)),
            db
                .select({ id: companies.id, name: companies.companyName })
                .from(companies)
                .where(inArray(companies.id, buyerIds)),
        ]);
        for (const m of members) {
            const list = membersByCompany.get(m.companyId);
            if (list) list.push(m.userId);
            else membersByCompany.set(m.companyId, [m.userId]);
        }
        for (const c of comps) nameByCompany.set(c.id, c.name);
    }

    for (const propertyId of uniqueIds) {
        const buyer = buyerByProperty.get(propertyId);
        const companyId = buyer?.buyerId ?? null;
        if (!companyId) {
            result.set(propertyId, { ...EMPTY, companyName: buyer?.buyerName ?? null });
            continue;
        }
        result.set(propertyId, {
            companyId,
            companyName: nameByCompany.get(companyId) ?? buyer?.buyerName ?? null,
            userIds: membersByCompany.get(companyId) ?? [],
        });
    }

    return result;
}
