import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription, getTestDb } from '../../../helpers/db';
import { resolveMsaId } from 'server/utils/resolveMsa';
import { deals } from '@database/schemas/deals.schema';
import { msas } from '@database/schemas/msas.schema';
import { eq } from 'drizzle-orm';

// Mock resolveMsa so tests don't depend on properties/addresses rows existing in
// the test branch. The mock is wired to the real seeded MSA id in beforeAll.
vi.mock('server/utils/resolveMsa', () => ({
    resolveMsaId: vi.fn(),
}));

// ── Test user IDs ──────────────────────────────────────────────────────────
// Each integration test file must use unique IDs to avoid conflicts when
// files run concurrently.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000010';
const DEAL_OWNER_ID = '00000000-0000-0000-0000-000000000011';

// Seeds both users, removes ACTING_USER_ID's roles before each test.
// DEAL_OWNER_ID keeps its roles (set once in beforeAll below).
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, DEAL_OWNER_ID);

let seededDealId: number;
let seededMsaId: number;

const MSA_NAME = 'San Diego-Chula Vista-Carlsbad, CA';

// Runs after setupIntegrationUsers' beforeAll (both users are seeded at this point).
beforeAll(async () => {
    const db = getTestDb();

    // Get or create the MSA. A known name is used so the record persists across
    // test runs and can be shared with the live app.
    let [msa] = await db.select().from(msas).where(eq(msas.name, MSA_NAME)).limit(1);
    if (!msa) {
        [msa] = await db.insert(msas).values({ name: MSA_NAME }).returning();
    }

    // Point the mock at the real MSA id so the FK on deals is satisfied and
    // the updateDeal service doesn't reject with a 422.
    vi.mocked(resolveMsaId).mockResolvedValue(msa.id);
    seededMsaId = msa.id;

    // Give DEAL_OWNER_ID the minimum role needed to pass requireSub's bypass
    // list on the PATCH route, without granting any admin privileges.
    await assignRole(DEAL_OWNER_ID, 'member');

    // Seed the deal that all tests in this file will operate on.
    // It is cascade-deleted when DEAL_OWNER_ID is torn down by afterAll.
    const [deal] = await db
        .insert(deals)
        .values({
            userId: DEAL_OWNER_ID,
            msaId: msa.id,
            type: 'wholesale',
            city: 'San Diego',
            state: 'CA',
            zipCode: '92101',
            price: '350000',
        })
        .returning();
    seededDealId = deal.id;
});

// ── Helpers ────────────────────────────────────────────────────────────────

function patchDeal(actingUserId: string) {
    // No `address` field — avoids triggering the SFR property-detail lookup
    // in updateDeal, so no external API calls are needed.
    return request(getApp())
        .patch(`/api/deals/${seededDealId}`)
        .set('x-test-user-id', actingUserId)
        .send({ notes: 'Updated by integration test' });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PATCH /api/deals/:id — ownership enforcement (integration)', () => {
    describe('editing a deal owned by another user', () => {
        it('returns 200 when caller has owner role', async () => {
            await assignRole(ACTING_USER_ID, 'owner');
            expect((await patchDeal(ACTING_USER_ID)).status).toBe(200);
        });

        it('returns 200 when caller has admin role', async () => {
            await assignRole(ACTING_USER_ID, 'admin');
            expect((await patchDeal(ACTING_USER_ID)).status).toBe(200);
        });

        // relationship-manager passes requireSub (bypass role) but the service
        // only allows admin/owner to override ownership — expects 403.
        it('returns 403 when caller has relationship-manager role', async () => {
            await assignRole(ACTING_USER_ID, 'relationship-manager');
            expect((await patchDeal(ACTING_USER_ID)).status).toBe(403);
        });

        // member passes requireSub (bypass role) but not the service ownership check.
        it('returns 403 when caller has member role', async () => {
            await assignRole(ACTING_USER_ID, 'member');
            expect((await patchDeal(ACTING_USER_ID)).status).toBe(403);
        });

        // No role + no subscription — blocked by requireSub middleware itself.
        it('returns 403 when caller has no role or subscription', async () => {
            expect((await patchDeal(ACTING_USER_ID)).status).toBe(403);
        });
    });

    describe('editing own deal', () => {
        // DEAL_OWNER_ID has 'member' role (passes requireSub bypass) and owns
        // the seeded deal — the service skips the privilege check entirely.
        it('returns 200 when caller is the deal owner', async () => {
            expect((await patchDeal(DEAL_OWNER_ID)).status).toBe(200);
        });
    });

    // A basic-tier subscriber with NO bypass role now passes requireSub on every
    // deal write route (previously gated at pro/premium). They can create a deal
    // and manage their own: middleware passes via subscription, service passes via
    // ownership. `setupIntegrationUsers`' beforeEach clears ACTING_USER_ID's roles
    // before each test, so the 2xx is reached via the basic subscription — not a
    // leaked bypass role from an earlier test.
    describe('basic-tier subscriber managing own deals', () => {
        // Seed a deal owned by ACTING_USER_ID. Cascade-deleted in afterAll.
        async function seedOwnDeal(): Promise<number> {
            const [ownDeal] = await getTestDb()
                .insert(deals)
                .values({
                    userId: ACTING_USER_ID,
                    msaId: seededMsaId,
                    type: 'wholesale',
                    city: 'San Diego',
                    state: 'CA',
                    zipCode: '92101',
                    price: '350000',
                })
                .returning();
            return ownDeal.id;
        }

        it('returns 201 when a basic subscriber creates a deal', async () => {
            await assignSubscription(ACTING_USER_ID, 'basic');
            const res = await request(getApp())
                .post('/api/deals')
                .set('x-test-user-id', ACTING_USER_ID)
                .send({
                    userId: ACTING_USER_ID,
                    msaId: seededMsaId,
                    dealType: 'wholesale',
                    city: 'San Diego',
                    state: 'CA',
                    zipCode: '92101',
                    price: 350000,
                });
            expect(res.status).toBe(201);
        });

        it('returns 200 when a basic subscriber edits their own deal', async () => {
            await assignSubscription(ACTING_USER_ID, 'basic');
            const dealId = await seedOwnDeal();
            const res = await request(getApp())
                .patch(`/api/deals/${dealId}`)
                .set('x-test-user-id', ACTING_USER_ID)
                .send({ notes: 'Updated by basic subscriber' });
            expect(res.status).toBe(200);
        });

        it('returns 200 when a basic subscriber deletes their own deal', async () => {
            await assignSubscription(ACTING_USER_ID, 'basic');
            const dealId = await seedOwnDeal();
            const res = await request(getApp())
                .delete(`/api/deals/${dealId}`)
                .set('x-test-user-id', ACTING_USER_ID);
            expect(res.status).toBe(200);
        });
    });

    describe('unauthenticated', () => {
        it('returns 401 when there is no session', async () => {
            const res = await request(getApp())
                .patch(`/api/deals/${seededDealId}`)
                .send({ notes: 'test' });
            expect(res.status).toBe(401);
        });
    });
});
