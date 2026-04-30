import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { msas } from "./schemas/msas.schema";
import { accountTypes, roles, subscriptions } from "./schemas/users.schema";
import { statuses } from "./schemas/statuses.schema";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seed() {
    console.log("Seeding lookup tables...");

    await db.insert(msas).values([
        { name: "San Diego-Chula Vista-Carlsbad, CA" },
        { name: "Los Angeles-Long Beach-Anaheim, CA" },
        { name: "Denver-Aurora-Centennial, CO" },
        { name: "San Francisco-Oakland-Fremont, CA" },
        { name: "Miami-Fort Lauderdale-West Palm Beach, FL" },
        { name: "Port St. Lucie, FL" },
        { name: "Seattle-Tacoma-Bellevue, WA" },
        { name: "Tampa-St. Petersburg-Clearwater, FL" },
    ]).onConflictDoNothing();
    console.log("  ✓ msas");

    // id 1=agent, 2=investor, 3=wholesaler
    await db.insert(accountTypes).values([
        { name: "agent" },
        { name: "investor" },
        { name: "wholesaler" },
    ]).onConflictDoNothing();
    console.log("  ✓ account_types");

    // id 1=owner, 2=admin, 3=relationship-manager, 4=member
    await db.insert(roles).values([
        { name: "owner" },
        { name: "admin" },
        { name: "relationship-manager" },
        { name: "member" },
    ]).onConflictDoNothing();
    console.log("  ✓ roles");

    // id 1=in-renovation, 2=on-market, 3=sold, 4=wholesale
    await db.insert(statuses).values([
        { name: "in-renovation" },
        { name: "on-market" },
        { name: "sold" },
        { name: "wholesale" },
    ]).onConflictDoNothing();
    console.log("  ✓ statuses");

    // id 1=basic, 2=pro, 3=premium
    await db.insert(subscriptions).values([
        { name: "basic" },
        { name: "pro" },
        { name: "premium" },
    ]).onConflictDoNothing();
    console.log("  ✓ subscriptions");

    console.log("Seed complete.");
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
