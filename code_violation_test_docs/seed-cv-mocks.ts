/**
 * Code-Violation feature — local manual-testing seed.
 *
 * Inserts a small, deterministic fixture set into your LOCAL dev DB (DATABASE_URL) so the
 * code-violation pipeline can be exercised end-to-end against the scenario CSVs in this folder.
 *
 * Headline: justin@arvfinance.com is the sole member of a company that is the CURRENT OWNER
 * (most-recent arms-length buyer) of a real San Diego property — so a matched complaint on that
 * property resolves to justin and emails him.
 *
 * Throwaway: everything uses fixed UUIDs (the `0c0de111-…` namespace) so re-running is idempotent
 * (it deletes its own rows first) and `cleanup-cv-mocks.ts` can wipe it cleanly. Nothing here
 * touches real data.
 *
 *   npx tsx code_violation_test_docs/seed-cv-mocks.ts
 *
 * NOT for the test DB — this writes to DATABASE_URL (your dev branch), like `npm run db:seed`.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { users, roles, userRoles } from '@database/schemas/users.schema';
import { companies, companyMembers } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── Fixed identities (the `0c0de111` namespace = "code violation test") ──────────────
const JUSTIN_ID = '0c0de111-0000-4000-8000-000000000001';
const JUSTIN_EMAIL = 'justin@arvfinance.com';
const JUSTIN_PASSWORD = 'TestPassword123!'; // log in as justin locally with this

const CO_JUSTIN = '0c0de111-0000-4000-8000-0000000000a1'; // notifiable owner (justin is a member)
const CO_NOMEMBERS = '0c0de111-0000-4000-8000-0000000000a2'; // owner company with no platform users
const CO_PRIOR = '0c0de111-0000-4000-8000-0000000000a3'; // earlier owner in P_HAPPY's history

const P_HAPPY = '0c0de111-0000-4000-8000-0000000000b1'; // 4521 Adams Ave  → justin notified
const P_NOMEM = '0c0de111-0000-4000-8000-0000000000b2'; // 4602 Felton St  → stored, no email
const P_INDIV = '0c0de111-0000-4000-8000-0000000000b3'; // 3915 Idaho St   → individual owner, no email
const P_AMB1 = '0c0de111-0000-4000-8000-0000000000b4'; // 100 Birch St (92101) ┐ ambiguous together
const P_AMB2 = '0c0de111-0000-4000-8000-0000000000b5'; // 100 Birch St (92113) ┘ (CSV carries no zip)
const P_TMP = '0c0de111-0000-4000-8000-0000000000b6'; // 5050 Cape May Ave → justin (##TMP→CE dedup)

const COMPANY_IDS = [CO_JUSTIN, CO_NOMEMBERS, CO_PRIOR];
const PROPERTY_IDS = [P_HAPPY, P_NOMEM, P_INDIV, P_AMB1, P_AMB2, P_TMP];

// sfr_property_id is a NOT NULL UNIQUE bigint — use an obvious out-of-range test band.
const SFR = {
    [P_HAPPY]: 9_100_000_001,
    [P_NOMEM]: 9_100_000_002,
    [P_INDIV]: 9_100_000_003,
    [P_AMB1]: 9_100_000_004,
    [P_AMB2]: 9_100_000_005,
    [P_TMP]: 9_100_000_006,
} as const;

const MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const COUNTY = 'San Diego';

async function seed() {
    console.log('Seeding code-violation test fixtures into DATABASE_URL...');

    // ── Idempotency: remove any prior run's rows first (FK-safe; deletes cascade) ──────
    // Deleting properties cascades addresses, property_transactions, and any cv_matches.
    // Deleting the user/companies cascades company_members and user_roles.
    await db.delete(properties).where(inArray(properties.id, PROPERTY_IDS));
    await db.delete(companies).where(inArray(companies.id, COMPANY_IDS));
    await db.delete(users).where(eq(users.id, JUSTIN_ID));

    // ── Companies (names are ALL CAPS in this DB — ARV.RAW-COMPANY-NAME) ───────────────
    await db.insert(companies).values([
        { id: CO_JUSTIN, companyName: 'JUSTIN TEST HOLDINGS LLC', isArvClient: true },
        { id: CO_NOMEMBERS, companyName: 'ORPHAN CAPITAL LLC', isArvClient: false },
        { id: CO_PRIOR, companyName: 'PRIOR OWNER LLC', isArvClient: false },
    ]);
    console.log('  ✓ companies (JUSTIN TEST HOLDINGS LLC, ORPHAN CAPITAL LLC, PRIOR OWNER LLC)');

    // ── justin: verified + notifications on (both required to be an email recipient) ──
    const passwordHash = await bcrypt.hash(JUSTIN_PASSWORD, 10);
    await db.insert(users).values({
        id: JUSTIN_ID,
        firstName: 'Justin',
        lastName: 'Test',
        phone: '(555) 010-0001',
        email: JUSTIN_EMAIL,
        passwordHash,
        emailVerifiedAt: new Date(), // getEmailRecipientsByUserIds requires a verified email
        notifications: true, // …and the master notifications kill-switch on
    });
    console.log(`  ✓ user ${JUSTIN_EMAIL} (password: ${JUSTIN_PASSWORD})`);

    // Give justin the owner role so you can also LOG IN as justin and upload/approve.
    const [ownerRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'owner'));
    if (ownerRole) {
        await db.insert(userRoles).values({ userId: JUSTIN_ID, roleId: ownerRole.id });
        console.log('  ✓ justin granted owner role (can log in to the admin panel)');
    } else {
        console.warn('  ! "owner" role not found — run `npm run db:seed` first to seed roles');
    }

    // ── justin ↔ JUSTIN TEST HOLDINGS LLC (the association we notify through) ──────────
    await db.insert(companyMembers).values({
        userId: JUSTIN_ID,
        companyId: CO_JUSTIN,
        role: 'owner',
        isPrimary: true,
    });
    console.log('  ✓ company_members: justin → JUSTIN TEST HOLDINGS LLC');

    // ── Properties ────────────────────────────────────────────────────────────────────
    await db.insert(properties).values(
        PROPERTY_IDS.map((id) => ({
            id,
            sfrPropertyId: SFR[id],
            propertyType: 'SFR',
            msa: MSA,
            county: COUNTY,
            status: 'in-renovation',
        })),
    );
    console.log('  ✓ properties (6)');

    // ── Addresses (formatted_street_address must normalize to the CSV street key) ──────
    // The matcher prefilters on street_number, then compares normalizeAddressForMatch(
    // formatted_street_address) === the CSV street key, plus city/state when present.
    await db.insert(addresses).values([
        addr(P_HAPPY, '4521', 'Adams', 'Ave', '92116'), // → 4521 ADAMS AVE
        addr(P_NOMEM, '4602', 'Felton', 'St', '92116'), // → 4602 FELTON ST
        addr(P_INDIV, '3915', 'Idaho', 'St', '92104'), // → 3915 IDAHO ST
        addr(P_AMB1, '100', 'Birch', 'St', '92101'), // ┐ identical street/city, different zip →
        addr(P_AMB2, '100', 'Birch', 'St', '92113'), // ┘ ambiguous when the CSV row omits the zip
        addr(P_TMP, '5050', 'Cape May', 'Ave', '92107'), // → 5050 CAPE MAY AVE
    ]);
    console.log('  ✓ addresses (6)');

    // ── Transactions ────────────────────────────────────────────────────────────────────
    // resolveOwner does NOT trust sort_order — it re-sorts by recording_date DESC and takes the
    // most-recent ARMS LENGTH buyer. So recency is what makes "current owner" here, not sort_order
    // (we still set sort_order to mirror the Data app: 1 = most recent).
    await db.insert(propertyTransactions).values([
        // P_HAPPY: PRIOR OWNER LLC bought in 2019, sold to JUSTIN TEST HOLDINGS LLC in 2023 (current).
        tx(P_HAPPY, '2019-03-15', 'ORIGINAL SELLER', null, 'PRIOR OWNER LLC', CO_PRIOR, '620000.00', 2),
        tx(P_HAPPY, '2023-08-10', 'PRIOR OWNER LLC', CO_PRIOR, 'JUSTIN TEST HOLDINGS LLC', CO_JUSTIN, '815000.00', 1),
        // P_NOMEM: current owner is a company we have NO users for → stored, never emailed.
        tx(P_NOMEM, '2022-05-01', 'SOME SELLER', null, 'ORPHAN CAPITAL LLC', CO_NOMEMBERS, '540000.00', 1),
        // P_INDIV: current owner is an individual (buyer_name only, no buyer_id) → stored, never emailed.
        tx(P_INDIV, '2021-11-20', 'SOME SELLER', null, 'JOHN Q PUBLIC', null, '475000.00', 1),
        // P_AMB1 / P_AMB2: ambiguous never reaches owner resolution, but give each a tx for realism.
        tx(P_AMB1, '2020-07-07', 'SOME SELLER', null, 'BIRCH ONE LLC', null, '500000.00', 1),
        tx(P_AMB2, '2020-09-09', 'SOME SELLER', null, 'BIRCH TWO LLC', null, '510000.00', 1),
        // P_TMP: current owner is JUSTIN TEST HOLDINGS LLC → justin notified (one alert; ##TMP→CE dedups the twin).
        tx(P_TMP, '2024-02-14', 'SOME SELLER', null, 'JUSTIN TEST HOLDINGS LLC', CO_JUSTIN, '690000.00', 1),
    ]);
    console.log('  ✓ property_transactions (7)');

    console.log('\nSeed complete. Next:');
    console.log('  1. Upload a CSV from code_violation_test_docs/ via the admin Code Violations tab');
    console.log('     (or log in as justin@arvfinance.com / ' + JUSTIN_PASSWORD + ').');
    console.log('  2. Drain the queue locally: npx tsx code_violation_test_docs/run-cv-consumer.ts');
    console.log('  3. See code_violation_test_docs/README.md for the expected outcome of each CSV.');
}

/** Build one 1:1 address row for a property (San Diego / CA). */
function addr(propertyId: string, number: string, name: string, suffix: string, zip: string) {
    return {
        propertyId,
        formattedStreetAddress: `${number} ${name} ${suffix}`,
        streetNumber: number,
        streetName: name,
        streetSuffix: suffix,
        city: 'San Diego',
        county: COUNTY,
        state: 'CA',
        zipCode: zip,
    };
}

/** Build one Arms Length property_transactions row. buyerId null ⇒ individual/unlinked owner. */
function tx(
    propertyId: string,
    date: string,
    sellerName: string,
    sellerId: string | null,
    buyerName: string,
    buyerId: string | null,
    salePrice: string,
    sortOrder: number,
) {
    return {
        propertyId,
        sellerName,
        sellerId,
        buyerName,
        buyerId,
        transactionType: 'Arms Length',
        saleDate: date,
        recordingDate: date,
        salePrice,
        sortOrder,
    };
}

seed()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    });
