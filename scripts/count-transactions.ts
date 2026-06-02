import 'dotenv/config';
import { db } from 'server/storage';
import { propertyTransactions } from '@database/schemas/properties.schema';
import { sql } from 'drizzle-orm';

async function main() {
    const result = await db.select({ count: sql<number>`count(*)` }).from(propertyTransactions);

    const count = result[0]?.count ?? 0;
    console.log(`[count-transactions] Total property transactions: ${count}`);
}

main()
    .catch((err) => {
        console.error('[count-transactions] Fatal error:', err);
        process.exit(1);
    })
    .finally(() => process.exit(0));
