import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { msas } from "./schemas/msas.schema";
import { accountTypes, roles, subscriptions } from "./schemas/users.schema";
import { statuses } from "./schemas/statuses.schema";
import { categories } from "./schemas/vendors.schema";

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

    await db.insert(categories).values([
        // ── Existing ──────────────────────────────────────────────────────────
        { name: "General Contractor",    slug: "general-contractor",    description: "Full-service renovation & rehab",                    iconName: "hammer" },
        { name: "Plumber",               slug: "plumber",               description: "Plumbing installation & repair",                     iconName: "wrench" },
        { name: "Electrician",           slug: "electrician",           description: "Electrical work & wiring",                           iconName: "zap" },
        { name: "Roofer",                slug: "roofer",                description: "Roofing installation & repair",                      iconName: "house" },
        { name: "HVAC",                  slug: "hvac",                  description: "Heating, ventilation & air conditioning",            iconName: "thermometer" },
        { name: "Home Stager",           slug: "home-stager",           description: "Interior staging for sale & showing",               iconName: "layout-dashboard" },
        { name: "Wholesaler",            slug: "wholesaler",            description: "Off-market deal sourcing",                           iconName: "handshake" },
        { name: "Painter",               slug: "painter",               description: "Interior & exterior painting",                       iconName: "paintbrush" },
        { name: "Flooring",              slug: "flooring",              description: "Hardwood, tile & flooring installation",             iconName: "layers" },
        { name: "Landscaping",           slug: "landscaping",           description: "Landscaping, grading & outdoor work",                iconName: "tree-pine" },

        // ── New ───────────────────────────────────────────────────────────────
        { name: "Appliances",            slug: "appliances",            description: "Appliance installation & repair",                    iconName: "microwave" },
        { name: "Applied Consultants",   slug: "applied-consultants",   description: "Specialized project consulting",                     iconName: "briefcase" },
        { name: "Architect",             slug: "architect",             description: "Architectural design & planning",                    iconName: "compass" },
        { name: "Asphalt",               slug: "asphalt",               description: "Asphalt paving & repair",                           iconName: "milestone" },
        { name: "Bathtub Refinisher",    slug: "bathtub-refinisher",    description: "Bathtub & tile refinishing & reglazing",            iconName: "bath" },
        { name: "Chimney",               slug: "chimney",               description: "Chimney inspection, cleaning & repair",              iconName: "wind" },
        { name: "Class A Contractor",    slug: "class-a-contractor",    description: "Licensed Class A general contractor",                iconName: "award" },
        { name: "Class B Contractor",    slug: "class-b-contractor",    description: "Licensed Class B general contractor",                iconName: "medal" },
        { name: "Class C Contractor",    slug: "class-c-contractor",    description: "Licensed Class C general contractor",                iconName: "badge" },
        { name: "Closet",                slug: "closet",                description: "Custom closet design & organization systems",        iconName: "archive" },
        { name: "Commercial Appraiser",  slug: "commercial-appraiser",  description: "Commercial property valuation",                      iconName: "building-2" },
        { name: "Concrete",              slug: "concrete",              description: "Concrete work, slabs & flatwork",                   iconName: "package" },
        { name: "Countertop",            slug: "countertop",            description: "Countertop fabrication & installation",              iconName: "table-2" },
        { name: "Credit Repair",         slug: "credit-repair",         description: "Credit counseling & repair services",                iconName: "credit-card" },
        { name: "Custom Home Numbers",   slug: "custom-home-numbers",   description: "Custom address numbers & signage",                   iconName: "hash" },
        { name: "Deck",                  slug: "deck",                  description: "Deck design, construction & repair",                 iconName: "layout-grid" },
        { name: "Design Studio",         slug: "design-studio",         description: "Full-service interior & renovation design studio",   iconName: "palette" },
        { name: "Doors",                 slug: "doors",                 description: "Door installation, repair & replacement",            iconName: "door-open" },
        { name: "Drafter",               slug: "drafter",               description: "Technical drafting & CAD drawings",                  iconName: "pen-tool" },
        { name: "Engineer",              slug: "engineer",              description: "Structural & civil engineering",                     iconName: "settings" },
        { name: "Escrow Manager",        slug: "escrow-manager",        description: "Escrow opening, coordination & closing",             iconName: "landmark" },
        { name: "Estate Sale",           slug: "estate-sale",           description: "Estate sale management & liquidation",               iconName: "shopping-bag" },
        { name: "Finishes",              slug: "finishes",              description: "Interior finishes, trim & millwork",                 iconName: "pencil" },
        { name: "Fire Extinguisher",     slug: "fire-extinguisher",     description: "Fire extinguisher inspection & service",             iconName: "flame" },
        { name: "Foundation",            slug: "foundation",            description: "Foundation repair & waterproofing",                  iconName: "anchor" },
        { name: "Garage Door",           slug: "garage-door",           description: "Garage door installation & repair",                  iconName: "warehouse" },
        { name: "Geotechnical Engineer", slug: "geotechnical-engineer", description: "Soil testing & geotechnical analysis",               iconName: "mountain" },
        { name: "Gutter",                slug: "gutter",                description: "Gutter installation, cleaning & repair",             iconName: "cloud-rain" },
        { name: "Home Inspector",        slug: "home-inspector",        description: "Pre-purchase & pre-listing inspections",             iconName: "clipboard-check" },
        { name: "Insurance",             slug: "insurance",             description: "Property & liability insurance",                     iconName: "shield-check" },
        { name: "Interior Designer",     slug: "interior-designer",     description: "Interior design & space planning",                   iconName: "sparkles" },
        { name: "Lawyer",                slug: "lawyer",                description: "Real estate & transaction legal services",           iconName: "scale" },
        { name: "Metal Work",            slug: "metal-work",            description: "Custom metalwork, railings & fabrication",           iconName: "nut" },
        { name: "Mold Remediation",      slug: "mold-remediation",      description: "Mold inspection, testing & removal",                 iconName: "shield-alert" },
        { name: "Mover",                 slug: "mover",                 description: "Residential & commercial moving services",           iconName: "truck" },
        { name: "Notary",                slug: "notary",                description: "Notary public & document signing",                   iconName: "pen" },
        { name: "Permit Services",       slug: "permit-services",       description: "Permit filing, running & consulting",                iconName: "clipboard-list" },
        { name: "Photographer",          slug: "photographer",          description: "Real estate & renovation photography",               iconName: "camera" },
        { name: "Pool Services",         slug: "pool-services",         description: "Pool construction, cleaning & maintenance",          iconName: "waves" },
        { name: "Property Management",   slug: "property-management",   description: "Rental property management & operations",            iconName: "key" },
        { name: "Scanner",               slug: "scanner",               description: "3D property scanning & documentation",               iconName: "scan" },
        { name: "Scaffolding",           slug: "scaffolding",           description: "Scaffolding rental & erection services",             iconName: "grid-3x3" },
        { name: "Septic Services",       slug: "septic-services",       description: "Septic system inspection, pumping & repair",         iconName: "droplets" },
        { name: "Staging",               slug: "staging",               description: "Vacant home staging for listings & showings",        iconName: "sofa" },
        { name: "Stairs",                slug: "stairs",                description: "Custom stair design, build & installation",          iconName: "arrow-up-down" },
        { name: "Surveyor",              slug: "surveyor",              description: "Land & property boundary surveying",                 iconName: "ruler" },
        { name: "Termite Control",       slug: "termite-control",       description: "Termite inspection, treatment & prevention",         iconName: "bug" },
        { name: "Title Rep",             slug: "title-rep",             description: "Title search, insurance & closing services",         iconName: "scroll" },
        { name: "Windows",               slug: "windows",               description: "Window & screen installation, repair & replacement", iconName: "app-window" },
    ]).onConflictDoNothing();
    console.log("  ✓ categories");

    console.log("Seed complete.");
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
