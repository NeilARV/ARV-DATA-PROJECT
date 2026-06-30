import { describe, it, expect, vi, beforeEach } from 'vitest';

// notifyViolation is the delivery core of the code-violation NOTIFY stage: it decides who gets an
// email (kill-switch), skips anyone already notified (re-approve / retry safety), and isolates a
// single bounce. Mock the boundaries it owns — db, the postmark email service, and the company-member
// lookup — so these assertions exercise that logic without a DB or live Postmark. See §4.6 / Chunk D.

const email = vi.hoisted(() => ({
    getDefaultFromEmail: vi.fn(() => 'from@arvfinance.com'),
    getEmailRecipientsByUserIds: vi.fn(),
    sendPlainEmail: vi.fn(),
}));
const claims = vi.hoisted(() => ({ getCompanyMembers: vi.fn() }));
const dbMock = vi.hoisted(() => {
    // Each db.select() call shifts the next queued result; await on the builder (or .limit()) resolves
    // to it. The claim insert is db.insert(...).values(...).onConflictDoNothing().returning(), which
    // resolves to one claim row by default; db.delete(...).where(...) releases a claim on send failure.
    const selectQueue: unknown[] = [];
    const returning = vi.fn().mockResolvedValue([{ id: 'claim-id' }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn(() => ({ where: deleteWhere }));
    const select = vi.fn(() => {
        const result = selectQueue.length > 0 ? selectQueue.shift() : [];
        const builder: Record<string, unknown> = {
            from: () => builder,
            where: () => builder,
            innerJoin: () => builder,
            limit: () => Promise.resolve(result),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(result).then(resolve, reject),
        };
        return builder;
    });
    return {
        db: { select, insert, delete: del },
        selectQueue,
        values,
        onConflictDoNothing,
        returning,
        insert,
        delete: del,
        deleteWhere,
    };
});

vi.mock('server/storage', () => ({ db: dbMock.db }));
vi.mock('server/services/postmark/email.services', () => email);
vi.mock('server/services/claims/claims.services', () => claims);

import { notifyViolation } from 'server/jobs/code-violations/processes/notify';
import type { CvViolation } from '@database/types/code-violations';

const OWNER_COMPANY_ID = '33333333-3333-3333-3333-333333333333';

function violation(): CvViolation {
    return {
        id: '11111111-1111-1111-1111-111111111111',
        recordNumber: 'CE-1',
        recordType: 'Code Enforcement',
        applicationName: 'Jane Doe',
        statusText: 'New',
        description: 'Overgrown lot',
        violationDate: '2026-01-15',
        rawAddress: '123 Main St',
        normalizedAddress: '123 MAIN ST',
        processingStatus: 'awaiting_review',
        notified: false,
        errorMessage: null,
        firstSeenUploadId: '22222222-2222-2222-2222-222222222222',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
    email.getDefaultFromEmail.mockReturnValue('from@arvfinance.com');
    email.sendPlainEmail.mockResolvedValue(undefined);
});

describe('notifyViolation', () => {
    it('sends one email per eligible recipient and records each delivery', async () => {
        email.getEmailRecipientsByUserIds.mockResolvedValue([
            { userId: 'u1', email: 'a@x.com' },
            { userId: 'u2', email: 'b@x.com' },
        ]);
        // 1st select = already-sent (none); 2nd select = owning-company name.
        dbMock.selectQueue.push([], [{ companyName: 'ACME LLC' }]);

        const res = await notifyViolation({
            violation: violation(),
            ownerCompanyId: OWNER_COMPANY_ID,
            memberUserIds: ['u1', 'u2'],
        });

        expect(res.emailsSent).toBe(2);
        expect(res.notified).toBe(true);
        expect(email.sendPlainEmail).toHaveBeenCalledTimes(2);
        // Each recipient is claimed (insert) before the send; no claim is released.
        expect(dbMock.insert).toHaveBeenCalledTimes(2);
        expect(dbMock.delete).not.toHaveBeenCalled();
        // memberUserIds was supplied, so the company-members lookup is skipped.
        expect(claims.getCompanyMembers).not.toHaveBeenCalled();
    });

    it('skips a recipient already notified for this complaint (no double-send)', async () => {
        email.getEmailRecipientsByUserIds.mockResolvedValue([{ userId: 'u1', email: 'a@x.com' }]);
        // already-sent ledger already has u1 → nothing left to send.
        dbMock.selectQueue.push([{ userId: 'u1' }]);

        const res = await notifyViolation({
            violation: violation(),
            ownerCompanyId: OWNER_COMPANY_ID,
            memberUserIds: ['u1'],
        });

        expect(res.emailsSent).toBe(0);
        // Sent nothing this pass, but a prior delivery is on the ledger → still reports notified.
        expect(res.notified).toBe(true);
        expect(email.sendPlainEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when the kill-switch drops every recipient', async () => {
        email.getEmailRecipientsByUserIds.mockResolvedValue([]);

        const res = await notifyViolation({
            violation: violation(),
            ownerCompanyId: OWNER_COMPANY_ID,
            memberUserIds: ['u1'],
        });

        expect(res.emailsSent).toBe(0);
        // No recipients and no prior ledger row → not notified.
        expect(res.notified).toBe(false);
        expect(email.sendPlainEmail).not.toHaveBeenCalled();
    });

    it('isolates a single failed send — one bounce does not abort the rest', async () => {
        email.getEmailRecipientsByUserIds.mockResolvedValue([
            { userId: 'u1', email: 'a@x.com' },
            { userId: 'u2', email: 'b@x.com' },
        ]);
        dbMock.selectQueue.push([], [{ companyName: 'ACME LLC' }]);
        email.sendPlainEmail.mockRejectedValueOnce(new Error('bounce')).mockResolvedValueOnce(undefined);

        const res = await notifyViolation({
            violation: violation(),
            ownerCompanyId: OWNER_COMPANY_ID,
            memberUserIds: ['u1', 'u2'],
        });

        // Both were claimed up front (claim-then-send); the bounced one's claim is released so a
        // later pass can retry it, the delivered one's claim stands.
        expect(res.emailsSent).toBe(1);
        expect(res.notified).toBe(true);
        expect(dbMock.insert).toHaveBeenCalledTimes(2);
        expect(dbMock.delete).toHaveBeenCalledTimes(1);
    });

    it('falls back to a company-members lookup when memberUserIds is omitted (approve path)', async () => {
        claims.getCompanyMembers.mockResolvedValue([{ userId: 'u1' }]);
        email.getEmailRecipientsByUserIds.mockResolvedValue([{ userId: 'u1', email: 'a@x.com' }]);
        dbMock.selectQueue.push([], [{ companyName: 'ACME LLC' }]);

        const res = await notifyViolation({
            violation: violation(),
            ownerCompanyId: OWNER_COMPANY_ID,
        });

        expect(claims.getCompanyMembers).toHaveBeenCalledWith(OWNER_COMPANY_ID);
        expect(email.getEmailRecipientsByUserIds).toHaveBeenCalledWith(['u1']);
        expect(res.emailsSent).toBe(1);
    });
});
