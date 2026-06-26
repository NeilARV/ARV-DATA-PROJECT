/**
 * Idempotent test harness for the code-violation pipeline (DEV only).
 *
 * Seeds a fully synthetic, reversible setup so you can exercise the whole flow end to
 * end — upload as admin, then receive the alert as the owning user:
 *   - a mock company (`ARV TEST PROPERTIES LLC`)
 *   - makes the test user its `owner` in company_members
 *   - a mock San Diego property + address + most-recent (sortOrder=1) Arms Length
 *     transaction whose buyer is the mock company
 *
 * The matching upload file is scripts/fixtures/code-violation-test.csv — its first row
 * ("1 Test St, San Diego CA 92101") is the address seeded here.
 *
 * Usage:
 *   npm run seed:code-violation-test              # seed
 *   npm run seed:code-violation-test -- --teardown # remove everything it created
 */
import { db } from '../server/storage';
import { eq, sql } from 'drizzle-orm';
import { users } from '@database/schemas/users.schema';
import { companies, companyMembers } from '@database/schemas/companies.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';

// ── Synthetic fixture identifiers (kept in sync with the test CSV's first row) ──
const TEST_USER_EMAIL = 'justin@arvfinance.com';
const MOCK_COMPANY_NAME = 'ARV TEST PROPERTIES LLC';
const MOCK_SFR_PROPERTY_ID = 999_000_001; // sentinel id, far outside real SFR range
const TEST_RECORD_PREFIX = 'CV-TEST-';
const MOCK_ADDRESS = {
    formattedStreetAddress: '1 Test St',
    streetNumber: '1',
    streetName: 'Test',
    streetSuffix: 'St',
    city: 'San Diego',
    county: 'San Diego',
    state: 'CA',
    zipCode: '92101',
} as const;

async function findTestUserId(): Promise<string> {
    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, TEST_USER_EMAIL))
        .limit(1);
    if (!user) {
        throw new Error(
            `Test user ${TEST_USER_EMAIL} not found on this database. Register/log in that ` +
                `account on dev first, then re-run.`,
        );
    }
    return user.id;
}

async function upsertMockCompany(): Promise<string> {
    const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.companyName, MOCK_COMPANY_NAME))
        .limit(1);
    if (existing) return existing.id;

    const [inserted] = await db
        .insert(companies)
        .values({ companyName: MOCK_COMPANY_NAME, updatedAt: new Date() })
        .onConflictDoNothing({ target: companies.companyName })
        .returning({ id: companies.id });
    if (inserted) return inserted.id;

    const [refetched] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.companyName, MOCK_COMPANY_NAME))
        .limit(1);
    if (!refetched) throw new Error('Failed to upsert mock company');
    return refetched.id;
}

async function upsertMockProperty(): Promise<string> {
    const [existing] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.sfrPropertyId, MOCK_SFR_PROPERTY_ID))
        .limit(1);
    if (existing) return existing.id;

    const [inserted] = await db
        .insert(properties)
        .values({ sfrPropertyId: MOCK_SFR_PROPERTY_ID, county: 'San Diego', msa: 'San Diego' })
        .returning({ id: properties.id });
    return inserted.id;
}

async function seed(): Promise<void> {
    const userId = await findTestUserId();
    const companyId = await upsertMockCompany();

    await db
        .insert(companyMembers)
        .values({ userId, companyId, role: 'owner', isPrimary: true })
        .onConflictDoNothing();

    const propertyId = await upsertMockProperty();

    await db
        .insert(addresses)
        .values({ propertyId, ...MOCK_ADDRESS })
        .onConflictDoNothing();

    // Replace any transactions on the mock property with a single most-recent (sortOrder=1)
    // Arms Length sale whose buyer is the mock company — that's the owner resolveOwners finds.
    await db.delete(propertyTransactions).where(eq(propertyTransactions.propertyId, propertyId));
    await db.insert(propertyTransactions).values({
        propertyId,
        buyerId: companyId,
        buyerName: MOCK_COMPANY_NAME,
        transactionType: 'Arms Length',
        saleDate: '2026-01-15',
        recordingDate: '2026-01-15',
        sortOrder: 1,
        userCreated: true,
    });

    console.log('\n✓ Code-violation test data seeded.');
    console.log(`  Owner user   : ${TEST_USER_EMAIL}`);
    console.log(`  Company      : ${MOCK_COMPANY_NAME}`);
    console.log(`  Property      : 1 Test St, San Diego CA 92101  (sfr_property_id ${MOCK_SFR_PROPERTY_ID})`);
    console.log('\nNext:');
    console.log('  1. Run the migration if you have not:  npm run migrate:code-violation');
    console.log('  2. Upload scripts/fixtures/code-violation-test.csv via the admin screen.');
    console.log(
        '  3. To receive the EMAIL on dev, set CV_ALERT_OVERRIDE_EMAIL (e.g. to your address);',
    );
    console.log('     the in-app bell alert lands regardless of email eligibility.');
    console.log('\nTeardown when done:  npm run seed:code-violation-test -- --teardown\n');
}

async function teardown(): Promise<void> {
    const [prop] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.sfrPropertyId, MOCK_SFR_PROPERTY_ID))
        .limit(1);
    if (prop) {
        // Deleting the property cascades its address + transactions (onDelete cascade).
        await db.delete(properties).where(eq(properties.id, prop.id));
    }

    const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.companyName, MOCK_COMPANY_NAME))
        .limit(1);
    if (company) {
        // Deleting the company cascades its company_members rows.
        await db.delete(companies).where(eq(companies.id, company.id));
    }

    // Best-effort: remove violations created from the test CSV (cv_ tables may not exist yet).
    try {
        await db.execute(
            sql`DELETE FROM cv_violations WHERE record_number LIKE ${TEST_RECORD_PREFIX + '%'}`,
        );
    } catch {
        // cv_ tables not migrated — nothing to clean.
    }

    console.log('\n✓ Code-violation test data removed.\n');
}

const isTeardown = process.argv.includes('--teardown');

(isTeardown ? teardown() : seed())
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[seed-code-violation-test] Failed:', err);
        process.exit(1);
    });
