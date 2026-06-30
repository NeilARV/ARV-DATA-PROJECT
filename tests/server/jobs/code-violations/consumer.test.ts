import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// runCodeViolationConsumer is the Phase-2 orchestrator (§4, §5.3). These tests assert its ROUTING —
// which terminal status each match outcome lands in and when an email actually fires — so every
// process step it calls is mocked; the per-step logic is covered in its own sibling test file. The
// review gate is read from CV_REQUIRE_REVIEW per run, so each test sets it explicitly.
const fetchQueue = vi.hoisted(() => ({ claimPendingViolations: vi.fn() }));
const markStatus = vi.hoisted(() => ({
    resetStaleProcessing: vi.fn(),
    markNoMatch: vi.fn(),
    markAmbiguous: vi.fn(),
    markAwaitingReview: vi.fn(),
    markComplete: vi.fn(),
    markFailed: vi.fn(),
    refreshUploadStatus: vi.fn(),
}));
const matchAddress = vi.hoisted(() => ({ matchViolationBatch: vi.fn() }));
const resolveOwnerMod = vi.hoisted(() => ({ resolveOwner: vi.fn() }));
const diffAndStoreMod = vi.hoisted(() => ({ diffAndStore: vi.fn() }));
const notifyMod = vi.hoisted(() => ({ notifyViolation: vi.fn() }));

vi.mock('server/jobs/code-violations/processes/fetch-queue', () => fetchQueue);
vi.mock('server/jobs/code-violations/processes/mark-status', () => markStatus);
vi.mock('server/jobs/code-violations/processes/match-address', () => matchAddress);
vi.mock('server/jobs/code-violations/processes/resolve-owner', () => resolveOwnerMod);
vi.mock('server/jobs/code-violations/processes/diff-and-store', () => diffAndStoreMod);
vi.mock('server/jobs/code-violations/processes/notify', () => notifyMod);

import { runCodeViolationConsumer } from 'server/jobs/code-violations/consumer';
import type { CvViolation } from '@database/types/code-violations';
import type { MatchOutcome } from 'server/jobs/code-violations/processes/match-address';

const UPLOAD_ID = 'up1';

function violation(overrides: Partial<CvViolation> = {}): CvViolation {
    return {
        id: 'v1',
        recordNumber: 'CE-1',
        violationDate: '2026-01-15',
        description: 'Overgrown lot',
        firstSeenUploadId: UPLOAD_ID,
        ...overrides,
    } as CvViolation;
}

/** One match record as matchViolationBatch yields it. `normalizedStreet` doubles as the dedup key. */
function match(outcome: MatchOutcome, v: Partial<CvViolation> = {}, normalizedStreet = '123 MAIN ST') {
    return { violation: violation(v), parsed: { normalizedStreet } as never, outcome };
}

const ORIGINAL_ENV = process.env.CV_REQUIRE_REVIEW;

beforeEach(() => {
    vi.clearAllMocks();
    markStatus.resetStaleProcessing.mockResolvedValue(0);
    fetchQueue.claimPendingViolations.mockResolvedValue([]);
    matchAddress.matchViolationBatch.mockResolvedValue([]);
    diffAndStoreMod.diffAndStore.mockResolvedValue({ isDuplicate: false });
    notifyMod.notifyViolation.mockResolvedValue({ emailsSent: 1, notified: true });
});

afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.CV_REQUIRE_REVIEW;
    else process.env.CV_REQUIRE_REVIEW = ORIGINAL_ENV;
});

describe('runCodeViolationConsumer', () => {
    it('runCodeViolationConsumer — empty queue — does no work', async () => {
        await runCodeViolationConsumer();

        expect(matchAddress.matchViolationBatch).not.toHaveBeenCalled();
        expect(markStatus.refreshUploadStatus).not.toHaveBeenCalled();
    });

    it('runCodeViolationConsumer — unmatched complaint — marks no_match', async () => {
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([match({ kind: 'unmatched' })]);

        await runCodeViolationConsumer();

        expect(markStatus.markNoMatch).toHaveBeenCalledWith('v1', '123 MAIN ST');
        expect(resolveOwnerMod.resolveOwner).not.toHaveBeenCalled();
        expect(markStatus.refreshUploadStatus).toHaveBeenCalledWith(UPLOAD_ID);
    });

    it('runCodeViolationConsumer — ambiguous complaint — marks ambiguous', async () => {
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([
            match({ kind: 'ambiguous', propertyIds: ['p1', 'p2'] }),
        ]);

        await runCodeViolationConsumer();

        expect(markStatus.markAmbiguous).toHaveBeenCalledWith('v1', '123 MAIN ST');
        expect(resolveOwnerMod.resolveOwner).not.toHaveBeenCalled();
    });

    it('runCodeViolationConsumer — matched + notifiable + review ON — holds at awaiting_review, no email', async () => {
        process.env.CV_REQUIRE_REVIEW = 'true';
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([match({ kind: 'matched', propertyId: 'p1' })]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: true,
            ownerCompanyId: 'c1',
            ownerName: 'ACME LLC',
            memberUserIds: ['u1'],
        });

        await runCodeViolationConsumer();

        expect(markStatus.markAwaitingReview).toHaveBeenCalledWith('v1', '123 MAIN ST');
        expect(notifyMod.notifyViolation).not.toHaveBeenCalled();
        expect(markStatus.markComplete).not.toHaveBeenCalled();
    });

    it('runCodeViolationConsumer — matched + notifiable + review OFF — emails inline and completes', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([match({ kind: 'matched', propertyId: 'p1' })]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: true,
            ownerCompanyId: 'c1',
            ownerName: 'ACME LLC',
            memberUserIds: ['u1'],
        });

        await runCodeViolationConsumer();

        expect(notifyMod.notifyViolation).toHaveBeenCalledWith({
            violation: expect.objectContaining({ id: 'v1' }),
            ownerCompanyId: 'c1',
            memberUserIds: ['u1'],
        });
        expect(markStatus.markComplete).toHaveBeenCalledWith('v1', {
            normalizedAddress: '123 MAIN ST',
            notified: true,
        });
        expect(markStatus.markAwaitingReview).not.toHaveBeenCalled();
    });

    it('runCodeViolationConsumer — matched but owner not notifiable — completes without an email', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([match({ kind: 'matched', propertyId: 'p1' })]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: false,
            ownerCompanyId: null,
            ownerName: 'JANE DOE',
        });

        await runCodeViolationConsumer();

        expect(notifyMod.notifyViolation).not.toHaveBeenCalled();
        expect(markStatus.markComplete).toHaveBeenCalledWith('v1', {
            normalizedAddress: '123 MAIN ST',
            notified: false,
        });
    });

    it('runCodeViolationConsumer — ##TMP→CE duplicate (DB-side) — completes without an email', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        fetchQueue.claimPendingViolations.mockResolvedValue([violation()]);
        matchAddress.matchViolationBatch.mockResolvedValue([match({ kind: 'matched', propertyId: 'p1' })]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: true,
            ownerCompanyId: 'c1',
            ownerName: 'ACME LLC',
            memberUserIds: ['u1'],
        });
        diffAndStoreMod.diffAndStore.mockResolvedValue({ isDuplicate: true });

        await runCodeViolationConsumer();

        expect(notifyMod.notifyViolation).not.toHaveBeenCalled();
        expect(markStatus.markComplete).toHaveBeenCalledWith('v1', {
            normalizedAddress: '123 MAIN ST',
            notified: false,
        });
    });

    it('runCodeViolationConsumer — same-batch ##TMP/CE twins — only the first alerts', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        const twinA = violation({ id: 'vA', recordNumber: '##TMP-1' });
        const twinB = violation({ id: 'vB', recordNumber: 'CE-9' });
        fetchQueue.claimPendingViolations.mockResolvedValue([twinA, twinB]);
        // Same normalizedStreet + violationDate + description → same in-run dedup key.
        matchAddress.matchViolationBatch.mockResolvedValue([
            match({ kind: 'matched', propertyId: 'p1' }, { id: 'vA' }),
            match({ kind: 'matched', propertyId: 'p1' }, { id: 'vB' }),
        ]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: true,
            ownerCompanyId: 'c1',
            ownerName: 'ACME LLC',
            memberUserIds: ['u1'],
        });

        await runCodeViolationConsumer();

        // First twin emails; second is caught by the in-run guard and completes silently.
        expect(notifyMod.notifyViolation).toHaveBeenCalledTimes(1);
        expect(markStatus.markComplete).toHaveBeenCalledWith('vB', {
            normalizedAddress: '123 MAIN ST',
            notified: false,
        });
    });

    it('runCodeViolationConsumer — resolves each property owner at most once per run', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        fetchQueue.claimPendingViolations.mockResolvedValue([
            violation({ id: 'vA' }),
            violation({ id: 'vB' }),
        ]);
        matchAddress.matchViolationBatch.mockResolvedValue([
            match({ kind: 'matched', propertyId: 'p1' }, { id: 'vA' }, '1 A ST'),
            match({ kind: 'matched', propertyId: 'p1' }, { id: 'vB' }, '2 B ST'),
        ]);
        resolveOwnerMod.resolveOwner.mockResolvedValue({
            isNotifiable: false,
            ownerCompanyId: null,
            ownerName: null,
        });

        await runCodeViolationConsumer();

        expect(resolveOwnerMod.resolveOwner).toHaveBeenCalledTimes(1);
    });

    it('runCodeViolationConsumer — one row throws — marks it failed and continues the batch', async () => {
        process.env.CV_REQUIRE_REVIEW = 'false';
        fetchQueue.claimPendingViolations.mockResolvedValue([
            violation({ id: 'vBad' }),
            violation({ id: 'vGood' }),
        ]);
        matchAddress.matchViolationBatch.mockResolvedValue([
            match({ kind: 'matched', propertyId: 'pBad' }, { id: 'vBad' }, '1 A ST'),
            match({ kind: 'unmatched' }, { id: 'vGood' }, '2 B ST'),
        ]);
        resolveOwnerMod.resolveOwner.mockRejectedValue(new Error('owner blew up'));

        await runCodeViolationConsumer();

        expect(markStatus.markFailed).toHaveBeenCalledWith('vBad', 'owner blew up');
        // The bad row didn't abort the batch — the good row was still processed.
        expect(markStatus.markNoMatch).toHaveBeenCalledWith('vGood', '2 B ST');
    });

    it('runCodeViolationConsumer — recovers stale processing rows before claiming a batch', async () => {
        markStatus.resetStaleProcessing.mockResolvedValue(3);

        await runCodeViolationConsumer();

        expect(markStatus.resetStaleProcessing).toHaveBeenCalled();
    });
});
