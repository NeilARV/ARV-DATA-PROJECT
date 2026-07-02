import { db } from 'server/storage';
import { properties, propertyTransactions } from '@database/schemas/properties.schema';
import { statuses, propertyStatuses } from '@database/schemas/statuses.schema';
import { companies } from '@database/schemas/companies.schema';
import { eq, asc, inArray, sql } from 'drizzle-orm';
import { trimCompanyName } from 'server/utils/normalization';
import { isFlippingCompany } from 'server/utils/dataSyncHelpers';
import { ARV_LENDER } from 'server/constants/transactions.constants';

// ─── Types ────────────────────────────────────────────────────────────────────

type TransactionRow = typeof propertyTransactions.$inferSelect;

type GetTransactionsResult = {
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
    isAssignment: boolean;
    assignorId: string | null;
    assignorName: string | null;
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
        isAssignment: tx.isAssignment,
        assignorId: tx.assignorId,
        assignorName: tx.assignorName,
    };
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

// ─── Assignment marking ────────────────────────────────────────────────────────

/**
 * Resolves assignor names to EXISTING company ids in a single query — never creates one.
 * Matching is case-insensitive: an admin may type an assignor in a different case than the
 * ALL-CAPS name SFR stores, and we still want it to link to the existing company.
 * @param names already-trimmed company names to look up
 * @returns a map from lower(trimmed) company name → id (only matched names appear)
 */
async function resolveExistingCompanyIds(names: string[]): Promise<Map<string, string>> {
    const byName = new Map<string, string>();
    if (names.length === 0) return byName;
    const lowered = Array.from(new Set(names.map((n) => n.trim().toLowerCase())));
    const rows = await db
        .select({ id: companies.id, companyName: companies.companyName })
        .from(companies)
        .where(
            sql`LOWER(TRIM(${companies.companyName})) IN (${sql.join(
                lowered.map((n) => sql`${n}`),
                sql`, `,
            )})`,
        );
    for (const row of rows) byName.set(row.companyName.trim().toLowerCase(), row.id);
    return byName;
}

export interface AssignmentUpdate {
    transactionId: number;
    isAssignment: boolean;
    assignorName: string | null;
}

/**
 * Marks (or clears) the assignment flag + assignor on existing ARMS LENGTH sale transactions.
 * assignorId is resolved to an existing company when the name matches one; an assignor that is
 * an individual (no company) keeps only assignorName. Each update is scoped to the property AND
 * to arms-length rows, so a transaction can't be annotated from another property's edit and only
 * real sales carry assignments (the pipeline re-apply restores assignments to arms-length rows
 * only — this keeps the flag surface consistent with what survives a sync).
 * @param propertyId the property the transactions belong to
 * @param updates one entry per transaction being marked or cleared
 */
export async function markTransactionAssignments(
    propertyId: string,
    updates: AssignmentUpdate[],
): Promise<void> {
    if (updates.length === 0) return;

    // Resolve every assignor name to a company id up front (one query) so building the
    // VALUES rows below doesn't fire a lookup per row.
    const namesToResolve = updates
        .filter((u) => u.isAssignment && u.assignorName)
        .map((u) => trimCompanyName(u.assignorName ?? ''))
        .filter((name): name is string => !!name);
    const companyIdByName = await resolveExistingCompanyIds(namesToResolve);

    // One VALUES row per update. The schema guarantees a non-empty assignorName whenever
    // isAssignment is true, so isAssignment alone determines mark (name + resolved id) vs
    // clear (all null). Every value is cast so the VALUES columns are typed even when null.
    const valueRows = updates.map((u) => {
        const trimmed = u.isAssignment ? trimCompanyName(u.assignorName ?? '') : null;
        const assignorId = trimmed ? (companyIdByName.get(trimmed.toLowerCase()) ?? null) : null;
        return sql`(${u.transactionId}::int, ${u.isAssignment}::boolean, ${assignorId}::uuid, ${trimmed}::varchar)`;
    });

    // A single atomic statement: neon-http is connectionless and has no transactions, so one
    // UPDATE (all-or-nothing on its own) is how we avoid partial application across rows. Scoped
    // to the property AND arms-length rows so a transaction can't be annotated from another
    // property's edit and only real sales carry assignments (keeps the flag surface consistent
    // with what the pipeline re-apply restores).
    await db.execute(sql`
        UPDATE property_transactions AS pt
        SET is_assignment = v.is_assignment,
            assignor_id = v.assignor_id,
            assignor_name = v.assignor_name,
            updated_at = NOW()
        FROM (VALUES ${sql.join(valueRows, sql`, `)})
            AS v(transaction_id, is_assignment, assignor_id, assignor_name)
        WHERE pt.property_transactions_id = v.transaction_id
          AND pt.property_id = ${propertyId}::uuid
          AND LOWER(TRIM(pt.transaction_type)) = 'arms length'
    `);
}
