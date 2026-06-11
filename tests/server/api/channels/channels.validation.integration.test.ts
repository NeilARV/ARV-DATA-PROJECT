import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller. Only invalid inputs are sent,
// so the Zod safeParse fails and returns 400 before any DB write occurs.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000022';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000023';
const DUMMY_CHANNEL_ID = '22222222-2222-2222-2222-222222222222';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

function postChannel(body: unknown) {
    return request(getApp())
        .post('/api/channels')
        .set('x-test-user-id', ACTING_USER_ID)
        .send(body as object);
}

describe('POST /api/channels — body validation (integration)', () => {
    it('returns 400 when name is missing', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect((await postChannel({ description: 'no name' })).status).toBe(400);
    });

    it('returns 400 when name has invalid characters', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect((await postChannel({ name: 'Has Spaces' })).status).toBe(400);
    });

    it('returns 400 when name exceeds the length limit', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        expect((await postChannel({ name: 'a'.repeat(81) })).status).toBe(400);
    });
});

describe('GET /api/channels/:id/members — validation (integration)', () => {
    it('returns 400 when the channel id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .get('/api/channels/not-a-uuid/members')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/channels/:id — validation (integration)', () => {
    it('returns 400 when the channel id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .patch('/api/channels/not-a-uuid')
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ description: 'x' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when name has invalid characters', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .patch(`/api/channels/${DUMMY_CHANNEL_ID}`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ name: 'INVALID NAME' });
        expect(res.status).toBe(400);
    });
});
