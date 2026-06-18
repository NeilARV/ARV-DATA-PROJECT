import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { setupIntegrationUsers } from '../../../helpers/setup';
import { assignRole, assignSubscription, getTestDb } from '../../../helpers/db';
import { channels } from '@database/schemas/mastermind.schema';

// Verifies the @announcement admin/owner gate in the message service: the chip is honored for an
// admin/owner author and stripped from a non-privileged author's content (tamper guard), while
// @channel stays open to everyone. Runs against the real controller + service + DB.
// Unique suffixes (70/71) so this file can run concurrently with the other message test files.
const ACTING_USER_ID = '00000000-0000-0000-0000-000000000070';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000071';
const SEED_CHANNEL_ID = '77777777-7777-7777-7777-777777777771';

const ANNOUNCEMENT_CHIP =
    '<span data-type="mention" class="mention" data-id="@announcement" data-label="announcement">@announcement</span>';
const CHANNEL_CHIP =
    '<span data-type="mention" class="mention" data-id="@channel" data-label="channel">@channel</span>';

const { getApp } = setupIntegrationUsers(ACTING_USER_ID, OTHER_USER_ID);

beforeAll(async () => {
    await getTestDb()
        .insert(channels)
        .values({ id: SEED_CHANNEL_ID, name: `test-announce-${ACTING_USER_ID.slice(-6)}` })
        .onConflictDoNothing();
});

afterAll(async () => {
    // Cascades to the messages/notifications created during the run.
    await getTestDb().delete(channels).where(eq(channels.id, SEED_CHANNEL_ID));
});

function postMessage(content: string) {
    return request(getApp())
        .post(`/api/channels/${SEED_CHANNEL_ID}/messages`)
        .set('x-test-user-id', ACTING_USER_ID)
        .send({ content });
}

describe('POST /api/channels/:id/messages — @announcement gate (integration)', () => {
    it('strips @announcement from a non-privileged (basic) author', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await postMessage(`<p>${ANNOUNCEMENT_CHIP} hello team</p>`);
        expect(res.status).toBe(201);
        expect(res.body.message.content).not.toContain('@announcement');
        expect(res.body.message.content).toContain('hello team');
    });

    it('keeps @announcement for an admin author', async () => {
        await assignRole(ACTING_USER_ID, 'admin');
        const res = await postMessage(`<p>${ANNOUNCEMENT_CHIP} hello team</p>`);
        expect(res.status).toBe(201);
        expect(res.body.message.content).toContain('@announcement');
    });

    it('strips a multi-line @announcement chip from a non-privileged author', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const multiLineChip =
            '<span data-type="mention" class="mention" data-id="@announcement" data-label="announcement">@announcement\nsecond line</span>';
        const res = await postMessage(`<p>${multiLineChip} hello team</p>`);
        expect(res.status).toBe(201);
        expect(res.body.message.content).not.toContain('@announcement');
        expect(res.body.message.content).not.toContain('data-id="@announcement"');
    });

    it('keeps @channel for a non-privileged (basic) author (not gated)', async () => {
        await assignSubscription(ACTING_USER_ID, 'basic');
        const res = await postMessage(`<p>${CHANNEL_CHIP} hi all</p>`);
        expect(res.status).toBe(201);
        expect(res.body.message.content).toContain('@channel');
    });
});
