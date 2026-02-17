import { db } from "server/storage";
import { companies } from "@database/schemas/companies.schema";
import {
  normalizeCompanyNameForStorage,
  normalizeCompanyNameForComparison,
} from "server/utils/normalization";
import type { MergedProperty } from "./batch-lookup";

export interface ResolvePropertyIdsParams {
  properties: MergedProperty[];
  cityCode: string;
}

/** Transaction with optional buyer_id/seller_id after resolve. */
export type TransactionWithIds = Record<string, unknown> & {
  buyer_id?: string | null;
  seller_id?: string | null;
};

/**
 * Merged property with buyer_id and seller_id resolved from companies table
 * on the property and on each transaction (when transactions array exists).
 */
export interface PropertyWithIds extends MergedProperty {
  property: MergedProperty["property"] & {
    buyer_id?: string | null;
    seller_id?: string | null;
  };
  transactions?: TransactionWithIds[];
}

function getTxString(tx: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = tx[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Resolves buyer_1 and seller_1 from each property to company IDs by looking up
 * in the companies table. Also resolves buyer_id/seller_id on each transaction
 * (BUYER_BORROWER1_NAME, SELLER1_NAME) using the same logic. Uses normalized
 * name matching. buyer_id and seller_id are null when not in companies table.
 */
export async function resolvePropertyIds(params: ResolvePropertyIdsParams): Promise<PropertyWithIds[]> {
    const { properties, cityCode } = params;

    const existingCompanies = await db.select().from(companies);
    const companyByCompareKey = new Map<string, (typeof existingCompanies)[0]>();
    for (const company of existingCompanies) {
        const key = normalizeCompanyNameForComparison(company.companyName);
        if (key) companyByCompareKey.set(key, company);
    }

    const resolveCompanyId = (name: string): string | null => {
        if (!name) return null;
        const storageName = normalizeCompanyNameForStorage(name);
        const compareKey = storageName
            ? normalizeCompanyNameForComparison(storageName)
            : null;
        const company = compareKey ? companyByCompareKey.get(compareKey) : null;
        return company ? company.id : null;
    };

    const result: PropertyWithIds[] = [];

    for (const item of properties) {
        const property = { ...item.property } as Record<string, unknown>;
        const currentSale = (property.current_sale as Record<string, unknown>) || {};

        const buyerName = (currentSale.buyer_1 as string) || "";
        const sellerName = (currentSale.seller_1 as string) || "";

        property.buyer_id = resolveCompanyId(buyerName);
        property.seller_id = resolveCompanyId(sellerName);

        // Normalize: we only use buyer_1/seller_1; buyer_2/seller_2 are not needed
        if (property.current_sale && typeof property.current_sale === "object") {
            const cs = property.current_sale as Record<string, unknown>;
            cs.buyer_2 = null;
            cs.seller_2 = null;
        }

        // Resolve buyer_id and seller_id on each transaction (same lookup logic)
        const transactions = (item as { transactions?: Record<string, unknown>[] }).transactions;
        let transactionsWithIds: TransactionWithIds[] | undefined;
        if (transactions && Array.isArray(transactions)) {
            transactionsWithIds = transactions.map((tx) => {
                const txRecord = { ...tx } as TransactionWithIds;
                const txBuyer = getTxString(txRecord, "BUYER_BORROWER1_NAME", "buyer_borrower1_name");
                const txSeller = getTxString(txRecord, "SELLER1_NAME", "seller1_name");
                txRecord.buyer_id = resolveCompanyId(txBuyer);
                txRecord.seller_id = resolveCompanyId(txSeller);
                return txRecord;
            });
        }

        result.push({
            ...item,
            property: property as MergedProperty["property"] & {
                buyer_id?: string | null;
                seller_id?: string | null;
            },
            ...(transactionsWithIds !== undefined && { transactions: transactionsWithIds }),
        });
    }

    const withBuyer = result.filter((p) => p.property.buyer_id);
    const withSeller = result.filter((p) => p.property.seller_id);
    console.log(`[${cityCode} SYNC] Resolved property IDs: ${withBuyer.length} with buyer_id, ${withSeller.length} with seller_id`);

    return result;
}
