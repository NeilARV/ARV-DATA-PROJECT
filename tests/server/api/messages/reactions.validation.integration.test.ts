import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller. Only invalid inputs are sent, so the id
// check / Zod safeParse fails and returns 400 before any DB write occurs.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000042';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000043';
const DUMMY_MESSAGE_ID = '66666666-6666-6666-6666-666666666661';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

describe('POST /api/messages/:id/reactions — validation (integration)', () => {
    it('returns 400 when the message id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post('/api/messages/not-a-uuid/reactions')
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '👍' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when emoji is missing', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({});
        expect(res.status).toBe(400);
    });

    it('returns 400 when emoji is not in the fixed set', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .post(`/api/messages/${DUMMY_MESSAGE_ID}/reactions`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ emoji: '🎉' });
        expect(res.status).toBe(400);
    });
});
