import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription, getTestDb } from '../../../helpers/db';
import { deals, dealBids } from '@database/schemas/deals.schema';
import { msas } from '@database/schemas/msas.schema';
import { eq } from 'drizzle-orm';

// ── Test user IDs ──────────────────────────────────────────────────────────
// Unique suffixes so this file can run concurrently with other integration files.
const BIDDER_USER_ID = '00000000-0000-0000-0000-000000000020';
const DEAL_OWNER_ID = '00000000-0000-0000-0000-000000000021';

// Seeds both users; clears BIDDER_USER_ID's roles + subscription before each test.
const { getApp } = setupIntegrationUsers(BIDDER_USER_ID, DEAL_OWNER_ID);

let seededDealId: number;

const MSA_NAME = 'San Diego-Chula Vista-Carlsbad, CA';

beforeAll(async () => {
    const db = getTestDb();

    let [msa] = await db.select().from(msas).where(eq(msas.name, MSA_NAME)).limit(1);
    if (!msa) {
        [msa] = await db.insert(msas).values({ name: MSA_NAME }).returning();
    }

    // DEAL_OWNER_ID owns the deal under test; a role lets it read its own offers
    // through requireSub-free GET while exercising the ownership path.
    await assignRole(DEAL_OWNER_ID, 'member');

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

const validOffer = {
    amount: 325000,
    firstName: 'Jane',
    lastName: 'Investor',
    email: 'jane@example.com',
    phone: '(555) 111-2222',
};

function postOffer(actingUserId: string | null, body: Record<string, unknown> = validOffer) {
    const req = request(getApp()).post(`/api/deals/${seededDealId}/offers`);
    if (actingUserId) req.set('x-test-user-id', actingUserId);
    return req.send(body);
}

function getOffers(actingUserId: string | null) {
    const req = request(getApp()).get(`/api/deals/${seededDealId}/offers`);
    if (actingUserId) req.set('x-test-user-id', actingUserId);
    return req;
}

async function seedBid(): Promise<number> {
    const [bid] = await getTestDb()
        .insert(dealBids)
        .values({
            dealId: seededDealId,
            bidderUserId: BIDDER_USER_ID,
            amount: '300000',
            firstName: 'Jane',
            lastName: 'Investor',
            email: 'jane@example.com',
        })
        .returning();
    return bid.id;
}

function deleteOffer(actingUserId: string | null, offerId: number) {
    const req = request(getApp()).delete(`/api/deals/${seededDealId}/offers/${offerId}`);
    if (actingUserId) req.set('x-test-user-id', actingUserId);
    return req;
}

// ── POST /api/deals/:id/offers — tier/role enforcement ───────────────────────

describe('POST /api/deals/:id/offers — access enforcement (integration)', () => {
    describe('allowed callers', () => {
        it('returns 201 when caller has a basic subscription', async () => {
            await assignSubscription(BIDDER_USER_ID, 'basic');
            expect((await postOffer(BIDDER_USER_ID)).status).toBe(201);
        });

        it('returns 201 when caller has a member role (no subscription)', async () => {
            await assignRole(BIDDER_USER_ID, 'member');
            expect((await postOffer(BIDDER_USER_ID)).status).toBe(201);
        });
    });

    describe('blocked callers', () => {
        it('returns 403 when caller has no role or subscription', async () => {
            expect((await postOffer(BIDDER_USER_ID)).status).toBe(403);
        });
    });

    describe('unauthenticated', () => {
        it('returns 401 when there is no session', async () => {
            expect((await postOffer(null)).status).toBe(401);
        });
    });
});

// ── POST /api/deals/:id/offers — input validation ────────────────────────────

describe('POST /api/deals/:id/offers — input validation (integration)', () => {
    // basic subscription clears requireSub so requests reach the validation layer.
    async function asSubscribedBidder() {
        await assignSubscription(BIDDER_USER_ID, 'basic');
    }

    it('returns 400 when amount is missing', async () => {
        await asSubscribedBidder();
        const { amount, ...body } = validOffer;
        expect((await postOffer(BIDDER_USER_ID, body)).status).toBe(400);
    });

    it('returns 400 when amount is zero or negative', async () => {
        await asSubscribedBidder();
        expect((await postOffer(BIDDER_USER_ID, { ...validOffer, amount: 0 })).status).toBe(400);
        await asSubscribedBidder();
        expect((await postOffer(BIDDER_USER_ID, { ...validOffer, amount: -5 })).status).toBe(400);
    });

    it('returns 400 when firstName is missing', async () => {
        await asSubscribedBidder();
        const { firstName, ...body } = validOffer;
        expect((await postOffer(BIDDER_USER_ID, body)).status).toBe(400);
    });

    it('returns 400 when email is invalid', async () => {
        await asSubscribedBidder();
        expect(
            (await postOffer(BIDDER_USER_ID, { ...validOffer, email: 'not-an-email' })).status,
        ).toBe(400);
    });
});

// ── GET /api/deals/:id/offers — ownership enforcement ────────────────────────

describe('GET /api/deals/:id/offers — ownership enforcement (integration)', () => {
    it('returns 200 when caller is the deal owner', async () => {
        expect((await getOffers(DEAL_OWNER_ID)).status).toBe(200);
    });

    it('returns 200 when caller has admin role', async () => {
        await assignRole(BIDDER_USER_ID, 'admin');
        expect((await getOffers(BIDDER_USER_ID)).status).toBe(200);
    });

    it('returns 403 when caller is neither owner nor privileged', async () => {
        await assignRole(BIDDER_USER_ID, 'member');
        expect((await getOffers(BIDDER_USER_ID)).status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        expect((await getOffers(null)).status).toBe(401);
    });
});

// ── DELETE /api/deals/:id/offers/:offerId — ownership enforcement ─────────────

describe('DELETE /api/deals/:id/offers/:offerId — ownership enforcement (integration)', () => {
    it('returns 200 when caller is the deal owner', async () => {
        const offerId = await seedBid();
        expect((await deleteOffer(DEAL_OWNER_ID, offerId)).status).toBe(200);
    });

    it('returns 200 when caller has admin role', async () => {
        const offerId = await seedBid();
        await assignRole(BIDDER_USER_ID, 'admin');
        expect((await deleteOffer(BIDDER_USER_ID, offerId)).status).toBe(200);
    });

    it('returns 403 when caller is neither owner nor privileged', async () => {
        const offerId = await seedBid();
        await assignRole(BIDDER_USER_ID, 'member');
        expect((await deleteOffer(BIDDER_USER_ID, offerId)).status).toBe(403);
    });

    it('returns 404 when the offer does not exist', async () => {
        expect((await deleteOffer(DEAL_OWNER_ID, 99999999)).status).toBe(404);
    });

    it('returns 401 when there is no session', async () => {
        const offerId = await seedBid();
        expect((await deleteOffer(null, offerId)).status).toBe(401);
    });
});
