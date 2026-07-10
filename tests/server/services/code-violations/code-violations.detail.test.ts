import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCompanyName } from '@shared/utils/formatCompanyName';

// getCodeViolationUploadViolations builds the admin per-complaint breakdown: it joins each complaint
// to its match/owner and resolves the owning company's eligible alert recipients. The recipient
// resolution is the logic worth pinning — members narrowed by the kill-switch
// (getEmailRecipientsByUserIds), deduped per company, and never `company_contacts`. Mock the
// boundaries it owns (db + the postmark recipient lookup) so these assertions exercise that mapping
// without a DB.

const email = vi.hoisted(() => ({
    getDefaultFromEmail: vi.fn(() => 'from@arvfinance.com'),
    getEmailRecipientsByUserIds: vi.fn(),
    sendPlainEmail: vi.fn(),
}));
const dbMock = vi.hoisted(() => {
    // Each db.select() call shifts the next queued result; the builder is thenable so awaiting it (or
    // its terminal .orderBy()) resolves to that result. getCodeViolationUploadViolations issues at
    // most two selects: the violations+match join, then the company-members lookup.
    const selectQueue: unknown[] = [];
    const select = vi.fn(() => {
        const result = selectQueue.length > 0 ? selectQueue.shift() : [];
        const builder: Record<string, unknown> = {
            from: () => builder,
            leftJoin: () => builder,
            where: () => builder,
            orderBy: () => Promise.resolve(result),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(result).then(resolve, reject),
        };
        return builder;
    });
    return { db: { select }, selectQueue };
});

vi.mock('server/storage', () => ({ db: dbMock.db }));
vi.mock('server/lib/supabase', () => ({
    getSupabase: () => ({}),
    codeViolationStorageBucket: 'test-code-violations-bucket',
}));
vi.mock('server/services/postmark/email.services', () => email);

import { getCodeViolationUploadViolations } from 'server/services/code-violations/code-violations.services';

const UPLOAD_ID = '22222222-2222-2222-2222-222222222222';
const COMPANY_ID = '33333333-3333-3333-3333-333333333333';

/** A joined row as the service's first select returns it (violation + its match/owner columns). */
function joinedRow(overrides: Record<string, unknown> = {}) {
    return {
        violation: {
            id: 'v1',
            recordNumber: 'CE-1',
            recordType: 'Complaint',
            statusText: 'New',
            description: 'Overgrown lot',
            violationDate: '2026-06-26',
            rawAddress: '991 Worthington St',
            processingStatus: 'complete',
            notified: true,
            errorMessage: null,
            createdAt: new Date('2026-06-30T12:00:00.000Z'),
        },
        propertyId: 'p1',
        ownerCompanyId: COMPANY_ID,
        ownerName: 'ACME HOLDINGS LLC',
        ownerCompanyName: 'ACME HOLDINGS LLC',
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
});

describe('getCodeViolationUploadViolations', () => {
    it('resolves recipients via the kill-switch and dedups members per company', async () => {
        // A member appears twice (u1) and a second member (u2) is dropped by the kill-switch.
        const memberRows = [
            { companyId: COMPANY_ID, userId: 'u1' },
            { companyId: COMPANY_ID, userId: 'u2' },
            { companyId: COMPANY_ID, userId: 'u1' },
        ];
        dbMock.selectQueue.push([joinedRow()], memberRows);
        email.getEmailRecipientsByUserIds.mockResolvedValue([{ userId: 'u1', email: 'a@x.com' }]);

        const result = await getCodeViolationUploadViolations(UPLOAD_ID);

        // Union of member user ids is passed once (deduped), not per row.
        expect(email.getEmailRecipientsByUserIds).toHaveBeenCalledWith(['u1', 'u2']);
        expect(result).toHaveLength(1);
        // u2 suppressed by the kill-switch, u1 deduped to a single entry.
        expect(result[0].recipients).toEqual([{ userId: 'u1', email: 'a@x.com' }]);
        // Owner company name is formatted for display (ARV.RAW-COMPANY-NAME).
        expect(result[0].ownerCompanyName).toBe(formatCompanyName('ACME HOLDINGS LLC'));
        // Date serialized to an ISO string for the wire.
        expect(result[0].createdAt).toBe('2026-06-30T12:00:00.000Z');
        expect(result[0].propertyId).toBe('p1');
    });

    it('returns empty recipients for an unmatched complaint without querying members', async () => {
        const unmatched = joinedRow({
            violation: { ...joinedRow().violation, id: 'v2', processingStatus: 'no_match' },
            propertyId: null,
            ownerCompanyId: null,
            ownerName: null,
            ownerCompanyName: null,
        });
        dbMock.selectQueue.push([unmatched]);

        const result = await getCodeViolationUploadViolations(UPLOAD_ID);

        expect(result).toHaveLength(1);
        expect(result[0].recipients).toEqual([]);
        expect(result[0].ownerCompanyName).toBeNull();
        // No company to resolve → the kill-switch lookup is skipped entirely.
        expect(email.getEmailRecipientsByUserIds).not.toHaveBeenCalled();
    });
});
