import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
    msas,
    userCountySubscriptions,
    emailSubscriptionListCounties,
} from '@database/schemas/msas.schema';
import { userNotificationPreferences, emailSubscriptionList } from '@database/schemas/users.schema';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { sentPropertyIds } from '@database/schemas/sync.schema';
import { sendTemplateToUsers } from 'server/services/postmark/email.services';
import { sendEmailUpdatesForMsa } from 'server/jobs/email/processes/emailUpdates';
import { getTestDb, seedTestUser, deleteTestUser } from '../../helpers/db';

// The daily job's external edges (TST.MOCK-THE-EDGE): Postmark sending and the Google Street
// View lookup. Everything else — recipient resolution (users and whitelist), candidate pool,
// per-recipient county/status filtering — runs for real against the test branch.
vi.mock('server/services/postmark/email.services', () => ({
    sendTemplateToUsers: vi.fn(),
}));
vi.mock('server/services/properties', () => ({
    StreetviewServices: { getStreetviewImage: vi.fn(async () => ({ available: true })) },
}));

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const ALPHA_SUB = '00000117-0000-4000-8000-000000000001';
const BETA_SUB = '00000117-0000-4000-8000-000000000002';
// Subscribed to a county none of the day's properties are in.
const GAMMA_SUB = '00000117-0000-4000-8000-000000000003';
// Subscribed to Alpha but status-filtered to 'sold' while the day's candidates are unstatused.
const SOLD_ONLY_ALPHA_SUB = '00000117-0000-4000-8000-000000000004';

const SEEDED_USERS = [ALPHA_SUB, BETA_SUB, GAMMA_SUB, SOLD_ONLY_ALPHA_SUB];

// A fake MSA + counties keep the candidate pool isolated: the shared test branch may hold
// real properties in every tracked MSA, and the pool query is only scoped by properties.msa.
const MSA_NAME = 'Emailupdates Integration MSA #117, CA';
const SFR_BASE = 954_117_000_000;
const SFR_IDS = [SFR_BASE + 1, SFR_BASE + 2, SFR_BASE + 3];

// Whitelist entries (issue #133): one subscribed to Alpha (receives Alpha's properties), one
// subscribed only to Gamma (no matching properties that day → receives nothing).
const WHITELIST_ALPHA_EMAIL = 'whitelist-117-alpha@integration.test.internal';
const WHITELIST_GAMMA_EMAIL = 'whitelist-117-gamma@integration.test.internal';
const SEEDED_WHITELIST_EMAILS = [WHITELIST_ALPHA_EMAIL, WHITELIST_GAMMA_EMAIL];

function emailOf(userId: string): string {
    return `${userId}@integration.test.internal`;
}

const db = getTestDb();

let msaId: number;
let alpha1Id: string;
let alpha2Id: string;
let beta1Id: string;

async function seedProperty(params: {
    sfrPropertyId: number;
    address: string;
    county: string;
    recordingDate: string;
}): Promise<string> {
    const [row] = await db
        .insert(properties)
        .values({
            sfrPropertyId: params.sfrPropertyId,
            msa: MSA_NAME,
            propertyType: 'Single Family',
        })
        .returning({ id: properties.id });
    await db.insert(addresses).values({
        propertyId: row.id,
        formattedStreetAddress: params.address,
        city: 'Testville',
        state: 'CA',
        county: params.county,
        zipCode: '90117',
    });
    await db.insert(propertyTransactions).values({
        propertyId: row.id,
        transactionType: 'Arms Length',
        saleDate: params.recordingDate,
        recordingDate: params.recordingDate,
        salePrice: '500000.00',
        buyerName: 'COUNTY FILTER BUYER LLC',
        sellerName: 'COUNTY FILTER SELLER LLC',
    });
    return row.id;
}

function capturedSend() {
    expect(vi.mocked(sendTemplateToUsers)).toHaveBeenCalledTimes(1);
    return vi.mocked(sendTemplateToUsers).mock.calls[0][0];
}

// Property ids a recipient would be emailed, parsed back out of each card's property_url.
function emailedPropertyIds(email: string, userId?: string): string[] {
    const model = capturedSend().templateModelForRecipient({ email, userId });
    const props = model.properties as { property_url: string }[];
    return props.map((p) => new URL(p.property_url).searchParams.get('property') ?? '');
}

beforeAll(async () => {
    await db.insert(msas).values({ name: MSA_NAME }).onConflictDoNothing();
    const [msaRow] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, MSA_NAME));
    msaId = msaRow.id;

    // Clear leftovers from an aborted previous run.
    await db.delete(properties).where(inArray(properties.sfrPropertyId, SFR_IDS));
    for (const id of SEEDED_USERS) {
        await deleteTestUser(id);
        await seedTestUser(id);
    }

    await db
        .insert(userNotificationPreferences)
        .values([
            { userId: ALPHA_SUB },
            { userId: BETA_SUB },
            { userId: GAMMA_SUB },
            { userId: SOLD_ONLY_ALPHA_SUB, dataAppStatusFilter: ['sold'] },
        ]);

    await db.insert(userCountySubscriptions).values([
        { userId: ALPHA_SUB, county: 'Alpha', state: 'CA', msaId },
        { userId: BETA_SUB, county: 'Beta', state: 'CA', msaId },
        { userId: GAMMA_SUB, county: 'Gamma', state: 'CA', msaId },
        { userId: SOLD_ONLY_ALPHA_SUB, county: 'Alpha', state: 'CA', msaId },
    ]);

    // Whitelist entries — county rows from an aborted previous run cascade with the parent delete.
    await db
        .delete(emailSubscriptionList)
        .where(inArray(emailSubscriptionList.email, SEEDED_WHITELIST_EMAILS));
    const whitelistEntries = await db
        .insert(emailSubscriptionList)
        .values([{ email: WHITELIST_ALPHA_EMAIL }, { email: WHITELIST_GAMMA_EMAIL }])
        .returning({ id: emailSubscriptionList.id, email: emailSubscriptionList.email });
    await db.insert(emailSubscriptionListCounties).values(
        whitelistEntries.map((e) => ({
            subscriptionListId: e.id,
            county: e.email === WHITELIST_ALPHA_EMAIL ? 'Alpha' : 'Gamma',
            state: 'CA',
            msaId,
        })),
    );

    // Recording dates order the pool ALPHA_1 → ALPHA_2 → BETA_1. ALPHA_2's raw casing
    // proves the county match is lower/trim-normalized against the subscription rows.
    alpha1Id = await seedProperty({
        sfrPropertyId: SFR_IDS[0],
        address: '1 Alpha St',
        county: 'Alpha',
        recordingDate: '2026-07-10',
    });
    alpha2Id = await seedProperty({
        sfrPropertyId: SFR_IDS[1],
        address: '2 Alpha St',
        county: ' ALPHA ',
        recordingDate: '2026-07-09',
    });
    beta1Id = await seedProperty({
        sfrPropertyId: SFR_IDS[2],
        address: '3 Beta St',
        county: 'Beta',
        recordingDate: '2026-07-08',
    });

    vi.mocked(sendTemplateToUsers).mockImplementation(async ({ recipients }) => ({
        sent: recipients.length,
        failed: [],
    }));

    await sendEmailUpdatesForMsa(MSA_NAME, 'Testville', 'CA');
});

afterAll(async () => {
    // Cascades: properties → addresses/transactions/sent_property_ids; users → prefs/subs;
    // whitelist entries → county rows.
    await db.delete(properties).where(inArray(properties.sfrPropertyId, SFR_IDS));
    for (const id of SEEDED_USERS) {
        await deleteTestUser(id);
    }
    await db
        .delete(emailSubscriptionList)
        .where(inArray(emailSubscriptionList.email, SEEDED_WHITELIST_EMAILS));
    await db.delete(msas).where(eq(msas.name, MSA_NAME));
});

describe('sendEmailUpdatesForMsa — per-user county filtering', () => {
    it('sendEmailUpdatesForMsa — subset-county subscriber — receives only their counties’ properties', async () => {
        expect(emailedPropertyIds(emailOf(ALPHA_SUB), ALPHA_SUB).sort()).toEqual(
            [alpha1Id, alpha2Id].sort(),
        );
        expect(emailedPropertyIds(emailOf(BETA_SUB), BETA_SUB)).toEqual([beta1Id]);
    });

    it('sendEmailUpdatesForMsa — subscriber with none of the day’s counties — skipped entirely', async () => {
        const recipientEmails = capturedSend().recipients.map((r) => r.email);
        expect(recipientEmails).not.toContain(emailOf(GAMMA_SUB));
        expect(recipientEmails).toContain(emailOf(ALPHA_SUB));
        expect(recipientEmails).toContain(emailOf(BETA_SUB));
    });

    it('sendEmailUpdatesForMsa — county filter composes with the status filter — no matching status means skipped', async () => {
        const recipientEmails = capturedSend().recipients.map((r) => r.email);
        expect(recipientEmails).not.toContain(emailOf(SOLD_ONLY_ALPHA_SUB));
    });

    it('sendEmailUpdatesForMsa — whitelist entry — receives only their counties’ properties', async () => {
        expect(emailedPropertyIds(WHITELIST_ALPHA_EMAIL).sort()).toEqual(
            [alpha1Id, alpha2Id].sort(),
        );
    });

    it('sendEmailUpdatesForMsa — whitelist entry with none of the day’s counties — receives nothing', async () => {
        const recipientEmails = capturedSend().recipients.map((r) => r.email);
        expect(recipientEmails).not.toContain(WHITELIST_GAMMA_EMAIL);
        expect(recipientEmails).toContain(WHITELIST_ALPHA_EMAIL);
    });

    it('sendEmailUpdatesForMsa — emailed properties — marked in sent_property_ids (TST.INT-STATE)', async () => {
        const rows = await db
            .select({ propertyId: sentPropertyIds.propertyId })
            .from(sentPropertyIds)
            .where(inArray(sentPropertyIds.propertyId, [alpha1Id, alpha2Id, beta1Id]));
        expect(rows.map((r) => r.propertyId).sort()).toEqual([alpha1Id, alpha2Id, beta1Id].sort());
    });
});
