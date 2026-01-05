import { properties } from "@shared/schema";
import { db } from "server/storage";
import { desc, sql } from "drizzle-orm";

export interface RecentPurchase {
  buyerName: string | null;
  address: string;
  price: number | null;
  dateSold: string | null;
  daysAgo: number;
}

export interface PaginatedPurchases {
  purchases: RecentPurchase[];
  hasMore: boolean;
  total: number;
}

export async function getRecentPurchases(
  limit: number = 20,
  page: number = 1,
  county?: string | null
): Promise<PaginatedPurchases> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const offset = (page - 1) * limit;

  // Build where conditions
  let whereClause = sql`${properties.dateSold} IS NOT NULL`;
  
  if (county) {
    const normalizedCounty = county.trim().toLowerCase();
    whereClause = sql`${whereClause} AND LOWER(TRIM(${properties.county})) = ${normalizedCounty}`;
  }

  // Get one extra to check if there are more pages
  const recentProperties = await db
    .select({
      propertyOwner: properties.propertyOwner,
      address: properties.address,
      price: properties.price,
      dateSold: properties.dateSold,
    })
    .from(properties)
    .where(whereClause)
    .orderBy(desc(properties.dateSold))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = recentProperties.length > limit;
  const purchases = recentProperties.slice(0, limit).map((property) => {
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
      price: property.price,
      dateSold: property.dateSold,
      daysAgo,
    };
  });

  // Get total count for reference (optional, can be removed if too slow)
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(properties)
    .where(whereClause);

  return {
    purchases,
    hasMore,
    total: Number(totalResult?.count || 0),
  };
}

export const BuyerServices = {
  getRecentPurchases,
};
