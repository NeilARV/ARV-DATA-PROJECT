import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller with an admin caller (pin is admin/owner
// only). Only invalid inputs are sent, so the id check / Zod safeParse returns 400 before any
// DB write occurs.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000046';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000047';
const DUMMY_CHANNEL_ID = '88888888-8888-8888-8888-888888888881';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

describe('POST /api/channels/:id/pin — validation (integration)', () => {
    it('returns 400 when the channel id is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .post('/api/channels/not-a-uuid/pin')
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ messageId: '88888888-8888-8888-8888-888888888882' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when messageId is missing', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({});
        expect(res.status).toBe(400);
    });

    it('returns 400 when messageId is not a uuid', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await request(getApp())
            .post(`/api/channels/${DUMMY_CHANNEL_ID}/pin`)
            .set('x-test-user-id', ACTING_USER_ID)
            .send({ messageId: 'not-a-uuid' });
        expect(res.status).toBe(400);
    });
});
