import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole } from '../../../helpers/db';

// Validation tests run against the REAL controller. The acting user is made admin so the
// requireRole gate passes and the Zod safeParse is what fails — returning 400 before any DB write.
const ACTING_USER_ID = 'c9890000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'c9890000-0000-4000-8000-000000000002';
const DUMMY_GROUP_ID = '99990000-0000-4000-8000-000000000001';
const DUMMY_COMPANY_ID = '99990000-0000-4000-8000-000000000002';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

const admin = () => assignRole(ACTING_USER_ID, 'admin');
const post = (path: string) => request(getApp()).post(path).set('x-test-user-id', ACTING_USER_ID);
const patch = (path: string) => request(getApp()).patch(path).set('x-test-user-id', ACTING_USER_ID);
const del = (path: string) => request(getApp()).delete(path).set('x-test-user-id', ACTING_USER_ID);

describe('POST /api/groups — body validation (integration)', () => {
    it('returns 400 when name is missing', async () => {
        await admin();
        expect((await post('/api/groups').send({ description: 'no name' })).status).toBe(400);
    });

    it('returns 400 when name is empty', async () => {
        await admin();
        expect((await post('/api/groups').send({ name: '   ' })).status).toBe(400);
    });

    it('returns 400 when name exceeds the length limit', async () => {
        await admin();
        expect((await post('/api/groups').send({ name: 'a'.repeat(256) })).status).toBe(400);
    });

    it('returns a { message, errors } body on validation failure', async () => {
        await admin();
        const res = await post('/api/groups').send({});
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('message');
        expect(Array.isArray(res.body.errors)).toBe(true);
    });
});

describe('PATCH /api/groups/:id — validation (integration)', () => {
    it('returns 400 when the group id is not a uuid', async () => {
        await admin();
        expect((await patch('/api/groups/not-a-uuid').send({ name: 'x' })).status).toBe(400);
    });

    it('returns 400 when the body is empty (no name or description)', async () => {
        await admin();
        expect((await patch(`/api/groups/${DUMMY_GROUP_ID}`).send({})).status).toBe(400);
    });

    it('returns 400 when name is empty', async () => {
        await admin();
        expect((await patch(`/api/groups/${DUMMY_GROUP_ID}`).send({ name: '' })).status).toBe(400);
    });
});

describe('DELETE /api/groups/:id — validation (integration)', () => {
    it('returns 400 when the group id is not a uuid', async () => {
        await admin();
        expect((await del('/api/groups/not-a-uuid')).status).toBe(400);
    });
});

describe('POST /api/groups/:id/merge — validation (integration)', () => {
    it('returns 400 when the source group id is not a uuid', async () => {
        await admin();
        const res = await post('/api/groups/not-a-uuid/merge').send({
            targetGroupId: DUMMY_GROUP_ID,
        });
        expect(res.status).toBe(400);
    });

    it('returns 400 when targetGroupId is missing', async () => {
        await admin();
        expect((await post(`/api/groups/${DUMMY_GROUP_ID}/merge`).send({})).status).toBe(400);
    });

    it('returns 400 when targetGroupId is not a uuid', async () => {
        await admin();
        const res = await post(`/api/groups/${DUMMY_GROUP_ID}/merge`).send({
            targetGroupId: 'nope',
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/groups/:id/companies — validation (integration)', () => {
    it('returns 400 when the group id is not a uuid', async () => {
        await admin();
        const res = await post('/api/groups/not-a-uuid/companies').send({
            companyId: DUMMY_COMPANY_ID,
        });
        expect(res.status).toBe(400);
    });

    it('returns 400 when companyId is missing', async () => {
        await admin();
        expect((await post(`/api/groups/${DUMMY_GROUP_ID}/companies`).send({})).status).toBe(400);
    });

    it('returns 400 when companyId is not a uuid', async () => {
        await admin();
        const res = await post(`/api/groups/${DUMMY_GROUP_ID}/companies`).send({
            companyId: 'nope',
        });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/groups/:id/companies/:companyId — validation (integration)', () => {
    it('returns 400 when the company id is not a uuid', async () => {
        await admin();
        expect((await del(`/api/groups/${DUMMY_GROUP_ID}/companies/nope`)).status).toBe(400);
    });
});

describe('POST /api/groups/:id/members — validation (integration)', () => {
    it('returns 400 when the group id is not a uuid', async () => {
        await admin();
        const res = await post('/api/groups/not-a-uuid/members').send({ userId: OTHER_USER_ID });
        expect(res.status).toBe(400);
    });

    it('returns 400 when userId is missing', async () => {
        await admin();
        expect((await post(`/api/groups/${DUMMY_GROUP_ID}/members`).send({})).status).toBe(400);
    });

    it('returns 400 when role is not a valid member_role', async () => {
        await admin();
        const res = await post(`/api/groups/${DUMMY_GROUP_ID}/members`).send({
            userId: OTHER_USER_ID,
            role: 'superadmin',
        });
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/groups/:id/members/:userId — validation (integration)', () => {
    it('returns 400 when the user id is not a uuid', async () => {
        await admin();
        expect(
            (await patch(`/api/groups/${DUMMY_GROUP_ID}/members/nope`).send({ role: 'owner' }))
                .status,
        ).toBe(400);
    });

    it('returns 400 when role is missing', async () => {
        await admin();
        expect(
            (await patch(`/api/groups/${DUMMY_GROUP_ID}/members/${OTHER_USER_ID}`).send({})).status,
        ).toBe(400);
    });

    it('returns 400 when role is not a valid member_role', async () => {
        await admin();
        const res = await patch(`/api/groups/${DUMMY_GROUP_ID}/members/${OTHER_USER_ID}`).send({
            role: 'boss',
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/groups/companies/:companyId/members — validation (integration)', () => {
    it('returns 400 when the company id is not a uuid', async () => {
        await admin();
        const res = await post('/api/groups/companies/not-a-uuid/members').send({
            userId: OTHER_USER_ID,
        });
        expect(res.status).toBe(400);
    });

    it('returns 400 when userId is missing', async () => {
        await admin();
        expect(
            (await post(`/api/groups/companies/${DUMMY_COMPANY_ID}/members`).send({})).status,
        ).toBe(400);
    });
});
