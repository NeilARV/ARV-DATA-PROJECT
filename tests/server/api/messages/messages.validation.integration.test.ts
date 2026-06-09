import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller. Only invalid inputs are sent, so
// the id check / Zod safeParse fails and returns 400 before any DB write occurs.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000032';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000033';
const DUMMY_CHANNEL_ID = '44444444-4444-4444-4444-444444444441';
const DUMMY_MESSAGE_ID = '44444444-4444-4444-4444-444444444442';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

function postMessage(channelId: string, body: unknown) {
    return request(getApp())
        .post(`/api/channels/${channelId}/messages`)
        .set('x-test-user-id', ACTING_USER_ID)
        .send(body as object);
}

describe('POST /api/channels/:id/messages — validation (integration)', () => {
    it('returns 400 when the channel id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postMessage('not-a-uuid', { content: '<p>hi</p>' })).status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postMessage(DUMMY_CHANNEL_ID, {})).status).toBe(400);
    });

    it('returns 400 when content is empty', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postMessage(DUMMY_CHANNEL_ID, { content: '' })).status).toBe(400);
    });

    it('returns 400 when content exceeds the length limit', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        expect((await postMessage(DUMMY_CHANNEL_ID, { content: 'a'.repeat(10001) })).status).toBe(
            400,
        );
    });
});

describe('PATCH /api/messages/:id — validation (integration)', () => {
    it('returns 400 when the message id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .patch('/api/messages/not-a-uuid')
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ content: '<p>edited</p>' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when content is missing', async () => {
        await assignRole(ACTING_USER_ID, 'member');
        const res = await request(getApp())
            .patch(`/api/messages/${DUMMY_MESSAGE_ID}`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({});
        expect(res.status).toBe(400);
    });
});
