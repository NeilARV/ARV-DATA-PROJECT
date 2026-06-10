import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignSubscription } from '../../../helpers/db';

// Validation tests run against the REAL controller. Only invalid inputs are sent,
// so the UUID guard rejects with 400 before any DB write occurs.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000052';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000053';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

describe('PATCH /api/notifications/:id/read — validation (integration)', () => {
    it('returns 400 when the notification id is not a uuid', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await request(getApp())
            .patch('/api/notifications/not-a-uuid/read')
            .set('x-test-user-id', ACTING_USER_ID);
        expect(res.status).toBe(400);
    });
});
