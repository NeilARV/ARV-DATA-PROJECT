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

/**
 * Merged property with buyer_id and seller_id resolved from companies table.
 */
export interface PropertyWithIds extends MergedProperty {
  property: MergedProperty["property"] & {
    buyer_id?: string | null;
    seller_id?: string | null;
  };
}

/**
 * Resolves buyer_1 and seller_1 from each property to company IDs by looking up
 * in the companies table. Uses normalized name matching. buyer_id and seller_id
 * are null when the buyer/seller is an individual (not in companies table).
 */
export async function resolvePropertyIds(
  params: ResolvePropertyIdsParams
): Promise<PropertyWithIds[]> {
  const { properties, cityCode } = params;

  const existingCompanies = await db.select().from(companies);
  const companyByCompareKey = new Map<string, (typeof existingCompanies)[0]>();
  for (const company of existingCompanies) {
    const key = normalizeCompanyNameForComparison(company.companyName);
    if (key) companyByCompareKey.set(key, company);
  }

  const result: PropertyWithIds[] = [];

  for (const item of properties) {
    const property = { ...item.property } as Record<string, unknown>;
    const currentSale = (property.current_sale as Record<string, unknown>) || {};

    const buyerName = (currentSale.buyer_1 as string) || "";
    const sellerName = (currentSale.seller_1 as string) || "";

    let buyerId: string | null = null;
    let sellerId: string | null = null;

    if (buyerName) {
      const storageName = normalizeCompanyNameForStorage(buyerName);
      const compareKey = storageName
        ? normalizeCompanyNameForComparison(storageName)
        : null;
      const company = compareKey ? companyByCompareKey.get(compareKey) : null;
      if (company) buyerId = company.id;
    }

    if (sellerName) {
      const storageName = normalizeCompanyNameForStorage(sellerName);
      const compareKey = storageName
        ? normalizeCompanyNameForComparison(storageName)
        : null;
      const company = compareKey ? companyByCompareKey.get(compareKey) : null;
      if (company) sellerId = company.id;
    }

    property.buyer_id = buyerId;
    property.seller_id = sellerId;

    result.push({
      ...item,
      property: property as MergedProperty["property"] & {
        buyer_id?: string | null;
        seller_id?: string | null;
      },
    });
  }

  const withBuyer = result.filter((p) => p.property.buyer_id);
  const withSeller = result.filter((p) => p.property.seller_id);
  console.log(
    `[${cityCode} SYNC] Resolved property IDs: ${withBuyer.length} with buyer_id, ${withSeller.length} with seller_id`
  );

  return result;
}
