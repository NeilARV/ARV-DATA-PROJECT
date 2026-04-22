import "dotenv/config";
import { db } from "server/storage";
import { propertyTransactions } from "@database/schemas/properties.schema";
import { sql } from "drizzle-orm";

const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(propertyTransactions);

const count = result[0]?.count ?? 0;
console.log(`[count-transactions] Total property transactions: ${count}`);

process.exit(0);
