import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { createTestApp } from '../../../helpers/setup';
import { getTestDb, seedTestUser, deleteTestUser, assignRole } from '../../../helpers/db';
import {
    users,
    emailSubscriptionList,
    userRelationshipManagers,
    subscriptions,
} from '@database/schemas/users.schema';
import {
    msas,
    userCountySubscriptions,
    emailSubscriptionListCounties,
} from '@database/schemas/msas.schema';

// The verification email that signup fires is a real Postmark send — stub it so these
// tests never leave the process, and so a send failure can't affect the assertions below.
vi.mock('server/services/postmark/linkEmail.services', () => ({
    sendLinkEmail: vi.fn().mockResolvedValue(undefined),
}));

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const RM_USER = '00000135-0000-4000-8000-000000000001';

// Emails unique to this file — whitelist rows are keyed by email, signups create users by email.
const UNION_EMAIL = 'wl-00000135-union@integration.test.internal';
const OVERLAP_EMAIL = 'wl-00000135-overlap@integration.test.internal';

const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA'; // 1:1 (single county)
const DENVER_MSA = 'Denver-Aurora-Centennial, CO'; // multi-county

const db = getTestDb();

async function ensureMsa(name: string): Promise<number> {
    // MSAs are shared reference data — never deleted in teardown; ensure-then-read repeats safely.
    await db.insert(msas).values({ name }).onConflictDoNothing();
    const [row] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, name)).limit(1);
    return row.id;
}

/** Seeds a whitelist entry (RM-linked) with the given county rows directly; returns its id. */
async function seedEntry(
    email: string,
    counties: { county: string; state: string; msaId: number }[],
) {
    const [created] = await db
        .insert(emailSubscriptionList)
        .values({ email, relationshipManagerId: RM_USER })
        .returning({ id: emailSubscriptionList.id });
    await db
        .insert(emailSubscriptionListCounties)
        .values(counties.map((c) => ({ subscriptionListId: created.id, ...c })));
    return created.id;
}

async function subscriptionRowsFor(userId: string) {
    return db
        .select({
            county: userCountySubscriptions.county,
            state: userCountySubscriptions.state,
            msaId: userCountySubscriptions.msaId,
        })
        .from(userCountySubscriptions)
        .where(eq(userCountySubscriptions.userId, userId));
}

async function deleteSignupUsers() {
    const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.email, [UNION_EMAIL, OVERLAP_EMAIL]));
    for (const row of rows) await deleteTestUser(row.id);
}

const signupBody = (email: string, county: string, state: string) => ({
    firstName: 'Integration',
    lastName: 'Signup',
    phone: '(555) 000-0000',
    email,
    password: 'correct-horse-battery-staple',
    county,
    state,
});

let app: Express;
let sdMsaId: number;
let denverMsaId: number;
let basicTierId: number;

beforeAll(async () => {
    app = createTestApp();
    sdMsaId = await ensureMsa(SD_MSA);
    denverMsaId = await ensureMsa(DENVER_MSA);

    const [basic] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.name, 'basic'))
        .limit(1);
    basicTierId = basic.id;

    await deleteTestUser(RM_USER);
    await seedTestUser(RM_USER);
    await assignRole(RM_USER, 'relationship-manager');
});

afterAll(async () => {
    await deleteSignupUsers();
    await db
        .delete(emailSubscriptionList)
        .where(inArray(emailSubscriptionList.email, [UNION_EMAIL, OVERLAP_EMAIL]));
    await deleteTestUser(RM_USER);
});

beforeEach(async () => {
    await deleteSignupUsers();
    await db
        .delete(emailSubscriptionList)
        .where(inArray(emailSubscriptionList.email, [UNION_EMAIL, OVERLAP_EMAIL]));
});

describe('POST /api/auth/signup — whitelist county transfer (integration)', () => {
    it('seeds the union of the entry counties and the home county, grants the tier, links the RM, deletes the entry', async () => {
        const entryId = await seedEntry(UNION_EMAIL, [
            { county: 'San Diego', state: 'CA', msaId: sdMsaId },
            { county: 'Adams', state: 'CO', msaId: denverMsaId },
        ]);

        const res = await request(app)
            .post('/api/auth/signup')
            .send(signupBody(UNION_EMAIL, 'Denver', 'CO'));
        expect(res.status).toBe(201);
        const userId = res.body.user.id;

        // Union of the entry's counties and the home county — read back from the DB.
        const rows = await subscriptionRowsFor(userId);
        expect(rows).toHaveLength(3);
        expect(new Set(rows.map((r) => `${r.county}|${r.state}|${r.msaId}`))).toEqual(
            new Set([
                `San Diego|CA|${sdMsaId}`,
                `Adams|CO|${denverMsaId}`,
                `Denver|CO|${denverMsaId}`,
            ]),
        );

        // Basic tier granted.
        const [userRow] = await db
            .select({ subscriptionId: users.subscriptionId })
            .from(users)
            .where(eq(users.id, userId));
        expect(userRow.subscriptionId).toBe(basicTierId);

        // RM linked.
        const rmLinks = await db
            .select({ relationshipManagerId: userRelationshipManagers.relationshipManagerId })
            .from(userRelationshipManagers)
            .where(eq(userRelationshipManagers.userId, userId));
        expect(rmLinks).toEqual([{ relationshipManagerId: RM_USER }]);

        // Whitelist entry deleted.
        const entries = await db
            .select({ id: emailSubscriptionList.id })
            .from(emailSubscriptionList)
            .where(eq(emailSubscriptionList.id, entryId));
        expect(entries).toHaveLength(0);
    });

    it('produces no duplicate rows when the home county is already among the entry counties', async () => {
        await seedEntry(OVERLAP_EMAIL, [
            { county: 'San Diego', state: 'CA', msaId: sdMsaId },
            { county: 'Denver', state: 'CO', msaId: denverMsaId },
        ]);

        const res = await request(app)
            .post('/api/auth/signup')
            .send(signupBody(OVERLAP_EMAIL, 'Denver', 'CO'));
        expect(res.status).toBe(201);

        const rows = await subscriptionRowsFor(res.body.user.id);
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((r) => `${r.county}|${r.state}|${r.msaId}`))).toEqual(
            new Set([`San Diego|CA|${sdMsaId}`, `Denver|CO|${denverMsaId}`]),
        );
    });
});
