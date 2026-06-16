import { db } from 'server/storage';
import { properties, propertyTransactions, parcels } from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { companies, companyMsas } from '@database/schemas/companies.schema';
import { msas } from '@database/schemas/msas.schema';
import { eq, asc, and, gte, inArray, sql } from 'drizzle-orm';
import { trimCompanyName } from 'server/utils/normalization';
import { addCountiesToCompanyIfNeeded } from 'server/utils/dataSyncHelpers';
import { isFlippingCompany } from 'server/utils/dataSyncHelpers';
import { ARV_LENDER } from 'server/constants/transactions.constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionRow = typeof propertyTransactions.$inferSelect;

export type GetTransactionsResult = {
    id: number;
    propertyId: string;
    transactionType: string | null;
    recordingDate: string;
    saleDate: string;
    buyerId: string | null;
    buyerName: string | null;
    sellerId: string | null;
    sellerName: string | null;
    salePrice: string | null;
    firstMtgLenderName: string | null;
    sortOrder: number | null;
    userCreated: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | null {
    if (d == null) return null;
    if (typeof d === 'string') return d.split('T')[0] ?? null;
    return (d as Date).toISOString().split('T')[0] ?? null;
}

function formatTxRow(tx: TransactionRow): GetTransactionsResult {
    return {
        id: tx.propertyTransactionsId,
        propertyId: tx.propertyId,
        transactionType: tx.transactionType,
        recordingDate: toDateStr(tx.recordingDate) ?? '',
        saleDate: toDateStr(tx.saleDate) ?? '',
        buyerId: tx.buyerId,
        buyerName: tx.buyerName,
        sellerId: tx.sellerId,
        sellerName: tx.sellerName,
        salePrice: tx.salePrice,
        firstMtgLenderName: tx.firstMtgLenderName,
        sortOrder: tx.sortOrder,
        userCreated: tx.userCreated,
    };
}

async function upsertCompanyByName(
    name: string,
    county: string | null,
    msa: string | null,
): Promise<string | null> {
    const trimmed = trimCompanyName(name);
    if (!trimmed) return null;

    const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.companyName, trimmed))
        .limit(1);

    let companyId: string;

    if (existing) {
        companyId = existing.id;
    } else {
        const inserted = await db
            .insert(companies)
            .values({ companyName: trimmed, updatedAt: new Date() })
            .onConflictDoNothing({ target: companies.companyName })
            .returning({ id: companies.id });

        if (inserted.length > 0) {
            companyId = inserted[0].id;
        } else {
            const [refetched] = await db
                .select({ id: companies.id })
                .from(companies)
                .where(eq(companies.companyName, trimmed))
                .limit(1);
            if (!refetched) return null;
            companyId = refetched.id;
        }
    }

    if (county) {
        await addCountiesToCompanyIfNeeded({ id: companyId }, [county]);
    }

    if (msa) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, msa))
            .limit(1);
        if (msaRow) {
            await db
                .insert(companyMsas)
                .values({ companyId, msaId: msaRow.id })
                .onConflictDoNothing();
        }
    }

    return companyId;
}

// ─── Reprocess ───────────────────────────────────────────────────────────────

const WHOLESALE_DAYS = 30;

function isArmsLength(type: string | null): boolean {
    return (type ?? '').trim().toLowerCase() === 'arms length';
}

function deriveStatuses(listingStatus: string | null, armsLengthTxs: TransactionRow[]): string[] {
    if (listingStatus?.toLowerCase() === 'on-market') return ['on-market'];

    const latest = armsLengthTxs[0] ?? null;
    if (!latest) return ['in-renovation'];

    const buyerName = latest.buyerName ?? '';
    const sellerName = latest.sellerName ?? '';
    const sellerId = latest.sellerId;

    const buyerIsCorp = isFlippingCompany(buyerName, null);
    const sellerIsCorp = isFlippingCompany(sellerName, null);

    const result: string[] = [];

    if (buyerIsCorp && sellerIsCorp) {
        const latestDate = toDateStr(latest.recordingDate);
        if (latestDate) {
            const sellerPriorTx = armsLengthTxs.slice(1).find((tx) => {
                const matchById = !!(sellerId && tx.buyerId && sellerId === tx.buyerId);
                const matchByName = !!(
                    sellerName &&
                    tx.buyerName &&
                    sellerName.trim().toLowerCase() === tx.buyerName.trim().toLowerCase()
                );
                return matchById || matchByName;
            });
            if (sellerPriorTx) {
                const priorDate = toDateStr(sellerPriorTx.recordingDate);
                if (priorDate) {
                    const days = Math.floor(
                        (new Date(latestDate).getTime() - new Date(priorDate).getTime()) /
                            (1000 * 60 * 60 * 24),
                    );
                    if (days <= WHOLESALE_DAYS) result.push('wholesale');
                }
            }
        }
    }

    if (sellerIsCorp && !buyerIsCorp) result.push('sold');
    if (buyerIsCorp) result.push('in-renovation');

    return result;
}

export async function reprocessProperty(propertyId: string): Promise<void> {
    const [prop] = await db
        .select({
            listingStatus: properties.listingStatus,
            county: properties.county,
            msa: properties.msa,
        })
        .from(properties)
        .where(eq(properties.id, propertyId))
        .limit(1);
    if (!prop) return;

    const txs = await db
        .select()
        .from(propertyTransactions)
        .where(eq(propertyTransactions.propertyId, propertyId))
        .orderBy(asc(propertyTransactions.sortOrder));

    const armsLengthSorted = txs.filter((tx) => isArmsLength(tx.transactionType));
    const latestAL = armsLengthSorted[0] ?? null;

    const isArvFunded = latestAL?.firstMtgLenderName?.trim().toUpperCase() === ARV_LENDER;

    const derivedStatuses = deriveStatuses(
        prop.listingStatus,
        armsLengthSorted as TransactionRow[],
    );

    await db
        .update(properties)
        .set({ isArvFunded, updatedAt: new Date() })
        .where(eq(properties.id, propertyId));

    if (derivedStatuses.length > 0) {
        const statusRows = await db
            .select({ id: statuses.id, name: statuses.name })
            .from(statuses)
            .where(inArray(statuses.name, derivedStatuses));

        await db.delete(propertyStatuses).where(eq(propertyStatuses.propertyId, propertyId));
        if (statusRows.length > 0) {
            await db
                .insert(propertyStatuses)
                .values(statusRows.map((s) => ({ propertyId, statusId: s.id })));
        }
    }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getPropertyTransactions(
    propertyId: string,
): Promise<GetTransactionsResult[]> {
    const rows = await db
        .select()
        .from(propertyTransactions)
        .where(eq(propertyTransactions.propertyId, propertyId))
        .orderBy(asc(propertyTransactions.sortOrder));

    return rows.map((tx) => formatTxRow(tx));
}

// ─── Append (called from patchProperty) ──────────────────────────────────────

export type BulkTransactionInput = {
    transactionType?: string | null;
    recordingDate: string;
    buyerName?: string | null;
    sellerName?: string | null;
    salePrice?: string | null;
    firstMtgLenderName?: string | null;
};

// Inserts a transaction at the end of the sort order for a property.
async function insertAtEnd(
    propertyId: string,
    row: Parameters<typeof db.insert>[0] extends never ? never : object,
): Promise<void> {
    const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
        .from(propertyTransactions)
        .where(eq(propertyTransactions.propertyId, propertyId));
    await db.insert(propertyTransactions).values({
        ...(row as typeof propertyTransactions.$inferInsert),
        sortOrder: (maxRow?.max ?? 0) + 1,
    });
}

// Assignment: finds the Arms Length transaction whose buyer_id matches the
// assignment's buyer_id and inserts the assignment immediately after it
// (shifting everything below down by one). Falls back to end if no match.
async function insertAssignment(
    propertyId: string,
    row: typeof propertyTransactions.$inferInsert,
    buyerId: string | null,
): Promise<void> {
    if (buyerId) {
        const [matchingAL] = await db
            .select({ sortOrder: propertyTransactions.sortOrder })
            .from(propertyTransactions)
            .where(
                and(
                    eq(propertyTransactions.propertyId, propertyId),
                    eq(propertyTransactions.buyerId, buyerId),
                    sql`LOWER(TRIM(${propertyTransactions.transactionType})) = 'arms length'`,
                ),
            )
            .orderBy(asc(propertyTransactions.sortOrder))
            .limit(1);

        if (matchingAL?.sortOrder != null) {
            const insertAt = matchingAL.sortOrder + 1;
            await db
                .update(propertyTransactions)
                .set({ sortOrder: sql`sort_order + 1` })
                .where(
                    and(
                        eq(propertyTransactions.propertyId, propertyId),
                        gte(propertyTransactions.sortOrder, insertAt),
                    ),
                );
            await db.insert(propertyTransactions).values({ ...row, sortOrder: insertAt });
            return;
        }
    }

    await insertAtEnd(propertyId, row);
}

export async function appendPropertyTransactions(
    propertyId: string,
    transactions: BulkTransactionInput[],
    county: string | null,
    msa: string | null,
): Promise<void> {
    if (transactions.length === 0) return;

    const [parcel] = await db
        .select({ apn: parcels.apnOriginal })
        .from(parcels)
        .where(eq(parcels.propertyId, propertyId))
        .limit(1);

    const apn = parcel?.apn ?? null;

    for (const tx of transactions) {
        const buyerId = tx.buyerName ? await upsertCompanyByName(tx.buyerName, county, msa) : null;
        const sellerId = tx.sellerName
            ? await upsertCompanyByName(tx.sellerName, county, msa)
            : null;

        const row: typeof propertyTransactions.$inferInsert = {
            propertyId,
            apn,
            transactionType: tx.transactionType ?? null,
            recordingDate: tx.recordingDate,
            saleDate: tx.recordingDate,
            buyerName: trimCompanyName(tx.buyerName ?? null),
            buyerId,
            sellerName: trimCompanyName(tx.sellerName ?? null),
            sellerId,
            salePrice: tx.salePrice ?? null,
            firstMtgLenderName: tx.firstMtgLenderName ?? null,
            userCreated: true,
        };

        const txType = (tx.transactionType ?? '').trim().toLowerCase();

        switch (txType) {
            case 'assignment':
                await insertAssignment(propertyId, row, buyerId);
                break;
            default:
                await insertAtEnd(propertyId, row);
        }
    }
}
