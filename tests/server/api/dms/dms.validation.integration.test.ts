import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller. Only invalid inputs are sent, so the id check /
// Zod safeParse fails and returns 400 before any DB write occurs. A role is assigned first so the
// request clears requireMastermind and reaches the controller's validation.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000082';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000083';
const DUMMY_USER_ID = '99999999-9999-9999-9999-999999999991';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

function postDm(userId: string, body: unknown) {
    return request(getApp())
        .post(`/api/dms/${userId}/messages`)
        .set('x-test-user-id', ACTING_USER_ID)
        .send(body as object);
}

describe('POST /api/dms/:userId/messages — validation (integration)', () => {
    it('returns 400 when the user id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postDm('not-a-uuid', { content: '<p>hi</p>' })).status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postDm(DUMMY_USER_ID, {})).status).toBe(400);
    });

    it('returns 400 when content is empty', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postDm(DUMMY_USER_ID, { content: '' })).status).toBe(400);
    });

    it('returns 400 when content exceeds the length limit', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postDm(DUMMY_USER_ID, { content: 'a'.repeat(10001) })).status).toBe(400);
    });
});

describe('GET /api/dms/:userId/messages — validation (integration)', () => {
    it('returns 400 when the user id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .get('/api/dms/not-a-uuid/messages')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(400);
    });
});
