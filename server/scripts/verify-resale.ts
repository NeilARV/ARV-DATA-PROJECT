/**
 * Verifies Denver test properties (820 E 131ST PL, 3849 W 118TH PL, 8191 BAYLOR LN)
 * after a sync run. Use to confirm resale updates: run once after initial mock sync,
 * then run with MOCK_RESALE=true sync, then run this again — 3849 W 118TH PL should
 * show seller=BRADBURN BUNGALOW LLC, buyer=null (SMITH JANE individual), status=sold.
 *
 * Run: npx tsx server/scripts/verify-resale.ts
 * (from project root; requires .env DATABASE_URL)
 */

import "dotenv/config";
import { db } from "../storage";
import { properties, addresses, propertyTransactions, companies } from "@database/schemas";
import { eq, inArray, desc } from "drizzle-orm";

const DENVER_TEST_SFR_IDS = [22336346, 22356084, 22373306]; // 820 E 131ST PL, 3849 W 118TH PL, 8191 BAYLOR LN

async function main() {
  const props = await db
    .select({
      id: properties.id,
      sfrPropertyId: properties.sfrPropertyId,
      buyerId: properties.buyerId,
      sellerId: properties.sellerId,
      status: properties.status,
      formattedStreetAddress: addresses.formattedStreetAddress,
    })
    .from(properties)
    .leftJoin(addresses, eq(properties.id, addresses.propertyId))
    .where(inArray(properties.sfrPropertyId, DENVER_TEST_SFR_IDS));

  if (props.length === 0) {
    console.log("No Denver test properties found in DB. Run the pipeline with mock data first.");
    return;
  }

  const companyRows = await db.select({ id: companies.id, companyName: companies.companyName }).from(companies);
  const companyByName = new Map(companyRows.map((c) => [c.id, c.companyName ?? ""]));

  const allTx = await db
    .select()
    .from(propertyTransactions)
    .where(inArray(propertyTransactions.propertyId, props.map((p) => p.id)))
    .orderBy(desc(propertyTransactions.saleDate));

  const latestTxByPropertyId = new Map<string | null, (typeof allTx)[0]>();
  for (const tx of allTx) {
    if (!latestTxByPropertyId.has(tx.propertyId)) {
      latestTxByPropertyId.set(tx.propertyId, tx);
    }
  }

  console.log("\n--- Denver test properties (current DB state) ---\n");
  for (const p of props) {
    const tx = latestTxByPropertyId.get(p.id) ?? null;
    const buyerName = p.buyerId ? companyByName.get(p.buyerId) ?? p.buyerId : "(individual)";
    const sellerName = p.sellerId ? companyByName.get(p.sellerId) ?? p.sellerId : "(individual)";
    console.log(`SFR ID: ${p.sfrPropertyId}  Address: ${p.formattedStreetAddress ?? "—"}`);
    console.log(`  Property row: buyer_id=${p.buyerId ?? "null"} (${buyerName}), seller_id=${p.sellerId ?? "null"} (${sellerName}), status=${p.status}`);
    if (tx) {
      console.log(`  Latest tx:   buyer=${tx.buyerName ?? "—"}, seller=${tx.sellerName ?? "—"}, sale_date=${tx.saleDate}, sale_price=${tx.salePrice}`);
    } else {
      console.log(`  Latest tx:   (none)`);
    }
    console.log("");
  }
  console.log("---\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
