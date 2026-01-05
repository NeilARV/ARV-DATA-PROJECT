import { properties } from "@shared/schema";
import { db } from "server/storage";
import { desc, sql } from "drizzle-orm";

export interface RecentPurchase {
  buyerName: string | null;
  address: string;
  purchasePrice: number | null;
  dateSold: string | null;
  daysAgo: number;
}

export async function getRecentPurchases(limit: number = 10): Promise<RecentPurchase[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const recentProperties = await db
    .select({
      propertyOwner: properties.propertyOwner,
      address: properties.address,
      purchasePrice: properties.purchasePrice,
      dateSold: properties.dateSold,
    })
    .from(properties)
    .where(sql`${properties.dateSold} IS NOT NULL`)
    .orderBy(desc(properties.dateSold))
    .limit(limit);

  return recentProperties.map((property) => {
    let daysAgo = 0;
    if (property.dateSold) {
      const soldDate = new Date(property.dateSold);
      soldDate.setHours(0, 0, 0, 0);
      const diffTime = today.getTime() - soldDate.getTime();
      daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      buyerName: property.propertyOwner,
      address: property.address,
      purchasePrice: property.purchasePrice,
      dateSold: property.dateSold,
      daysAgo,
    };
  });
}

export const BuyerServices = {
  getRecentPurchases,
};
