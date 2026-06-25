import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription } from '../../../helpers/db';

// ── Test user IDs ──────────────────────────────────────────────────────────
// Unique suffixes so this file can run concurrently with other integration files.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000014';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000015';

// Seeds both users; clears ACTING_USER_ID's roles + subscription before each test.
const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

// ── Helpers ────────────────────────────────────────────────────────────────

function getLocations(actingUserId: string | null) {
    const req = request(getApp()).get('/api/deals/locations');
    if (actingUserId) req.set('x-test-user-id', actingUserId);
    return req;
}

// ── GET /api/deals/locations — access gate (requireSub) ───────────────────────

describe('GET /api/deals/locations — access gate (integration)', () => {
    it('returns 200 with cities and zips arrays for a basic subscriber', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await getLocations(ACTING_USER_ID);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.cities)).toBe(true);
        expect(Array.isArray(res.body.zips)).toBe(true);
    });

    it('returns 200 for a member role with no subscription (bypass)', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await getLocations(ACTING_USER_ID)).status).toBe(200);
    });

    it('returns 403 when caller has no role or subscription', async () => {
        expect((await getLocations(ACTING_USER_ID)).status).toBe(403);
    });

    it('returns 401 when there is no session', async () => {
        expect((await getLocations(null)).status).toBe(401);
    });
});
