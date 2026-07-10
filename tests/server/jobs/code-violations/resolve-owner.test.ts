import { describe, it, expect, vi, beforeEach } from 'vitest';

// resolveOwner is the RESOLVE OWNER stage (§4.4): it finds the current owner via the most-recent
// arms-length transaction and decides notifiability from the owner's operator group (#93). Mock only
// the two DB-backed boundaries it calls — the transaction read and
// the group-target lookup — and let the REAL ownership logic (sortTransactionsDesc + isArmsLength
// from orderTransactions) run, since that ordering IS what we're asserting picks the right owner.
const txns = vi.hoisted(() => ({ getPropertyTransactions: vi.fn() }));
const groups = vi.hoisted(() => ({ getCompanyGroupNotificationTarget: vi.fn() }));

vi.mock('server/services/properties/propertyTransactions.services', () => txns);
vi.mock('server/services/groups/groups.services', () => groups);

import { resolveOwner } from 'server/jobs/code-violations/processes/resolve-owner';

const PROPERTY_ID = 'prop-1';
const COMPANY_ID = 'company-1';
const GROUP_ID = 'group-1';

type Tx = Record<string, unknown>;
function armsLength(overrides: Tx = {}): Tx {
    return { transactionType: 'Arms Length', recordingDate: '2025-01-01', ...overrides };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('resolveOwner', () => {
    it('resolveOwner — arms-length buyer is in a group with members — notifiable, carries the members', async () => {
        txns.getPropertyTransactions.mockResolvedValue([
            armsLength({ buyerId: COMPANY_ID, buyerName: 'ACME LLC' }),
        ]);
        groups.getCompanyGroupNotificationTarget.mockResolvedValue({
            groupId: GROUP_ID,
            memberUserIds: ['u1', 'u2'],
        });

        const res = await resolveOwner(PROPERTY_ID);

        expect(groups.getCompanyGroupNotificationTarget).toHaveBeenCalledWith(COMPANY_ID);
        expect(res).toEqual({
            isNotifiable: true,
            ownerCompanyId: COMPANY_ID,
            ownerName: 'ACME LLC',
            memberUserIds: ['u1', 'u2'],
        });
    });

    it('resolveOwner — company owner is ungrouped — not notifiable, company id retained', async () => {
        txns.getPropertyTransactions.mockResolvedValue([
            armsLength({ buyerId: COMPANY_ID, buyerName: 'ACME LLC' }),
        ]);
        // Ungrouped company → the group resolver returns null.
        groups.getCompanyGroupNotificationTarget.mockResolvedValue(null);

        const res = await resolveOwner(PROPERTY_ID);

        expect(res).toEqual({ isNotifiable: false, ownerCompanyId: COMPANY_ID, ownerName: 'ACME LLC' });
    });

    it('resolveOwner — grouped company with no members — not notifiable, company id retained', async () => {
        txns.getPropertyTransactions.mockResolvedValue([
            armsLength({ buyerId: COMPANY_ID, buyerName: 'ACME LLC' }),
        ]);
        groups.getCompanyGroupNotificationTarget.mockResolvedValue({
            groupId: GROUP_ID,
            memberUserIds: [],
        });

        const res = await resolveOwner(PROPERTY_ID);

        expect(res).toEqual({ isNotifiable: false, ownerCompanyId: COMPANY_ID, ownerName: 'ACME LLC' });
    });

    it('resolveOwner — individual owner (buyerName only, no buyerId) — not notifiable, never queries the group', async () => {
        txns.getPropertyTransactions.mockResolvedValue([
            armsLength({ buyerId: null, buyerName: 'JANE DOE' }),
        ]);

        const res = await resolveOwner(PROPERTY_ID);

        expect(groups.getCompanyGroupNotificationTarget).not.toHaveBeenCalled();
        expect(res).toEqual({ isNotifiable: false, ownerCompanyId: null, ownerName: 'JANE DOE' });
    });

    it('resolveOwner — no arms-length transaction — not notifiable with null owner', async () => {
        txns.getPropertyTransactions.mockResolvedValue([
            { transactionType: 'REFI', recordingDate: '2025-01-01', buyerId: COMPANY_ID },
        ]);

        const res = await resolveOwner(PROPERTY_ID);

        expect(groups.getCompanyGroupNotificationTarget).not.toHaveBeenCalled();
        expect(res).toEqual({ isNotifiable: false, ownerCompanyId: null, ownerName: null });
    });

    it('resolveOwner — resolves the MOST-RECENT arms-length owner regardless of input order', async () => {
        // Older sale to a different company listed first; resolveOwner must not trust input order and
        // must pick the 2025 buyer (the current owner), not the 2020 one.
        txns.getPropertyTransactions.mockResolvedValue([
            armsLength({ recordingDate: '2020-06-01', buyerId: 'old-co', buyerName: 'OLD LLC' }),
            armsLength({ recordingDate: '2025-03-15', buyerId: COMPANY_ID, buyerName: 'ACME LLC' }),
        ]);
        groups.getCompanyGroupNotificationTarget.mockResolvedValue({
            groupId: GROUP_ID,
            memberUserIds: ['u1'],
        });

        const res = await resolveOwner(PROPERTY_ID);

        expect(groups.getCompanyGroupNotificationTarget).toHaveBeenCalledWith(COMPANY_ID);
        expect(res).toMatchObject({ isNotifiable: true, ownerCompanyId: COMPANY_ID, ownerName: 'ACME LLC' });
    });
});
