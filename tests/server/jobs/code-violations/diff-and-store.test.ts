import { describe, it, expect, vi, beforeEach } from 'vitest';

// diffAndStore is the DIFF stage (§4.5): it always writes the cv_matches row, then runs the
// ##TMP→CE secondary dedup that prevents the same physical complaint (re-issued under a CE-* number
// after a ##TMP-* one) from double-alerting. Mock the db boundary it owns: select() shifts the next
// queued result (the dedup lookup), insert() records the cv_matches write.
const dbMock = vi.hoisted(() => {
    const selectQueue: unknown[] = [];
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => {
        const result = selectQueue.length > 0 ? selectQueue.shift() : [];
        const builder: Record<string, unknown> = {
            from: () => builder,
            where: () => builder,
            limit: () => Promise.resolve(result),
        };
        return builder;
    });
    return { db: { select, insert }, selectQueue, select, insert, values, onConflictDoNothing };
});

vi.mock('server/storage', () => ({ db: dbMock.db }));

import { diffAndStore } from 'server/jobs/code-violations/processes/diff-and-store';
import type { CvViolation } from '@database/types/code-violations';

function violation(overrides: Partial<CvViolation> = {}): CvViolation {
    return {
        id: 'v1',
        recordNumber: 'CE-1',
        recordType: 'Complaint',
        applicationName: 'Noise',
        statusText: 'New',
        description: 'Overgrown lot',
        violationDate: '2026-01-15',
        rawAddress: '123 Main St',
        normalizedAddress: '123 MAIN ST',
        processingStatus: 'processing',
        notified: false,
        errorMessage: null,
        firstSeenUploadId: 'up1',
        processedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

const PARAMS = {
    propertyId: 'p1',
    ownerCompanyId: 'c1',
    ownerName: 'ACME LLC',
    normalizedAddress: '123 MAIN ST',
};

beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
});

describe('diffAndStore', () => {
    it('diffAndStore — no prior alerted twin — not a duplicate, and writes the match', async () => {
        dbMock.selectQueue.push([]); // dedup lookup finds nothing

        const res = await diffAndStore({ violation: violation(), ...PARAMS });

        expect(res).toEqual({ isDuplicate: false });
        // cv_matches written idempotently with the resolved owner snapshot.
        expect(dbMock.values).toHaveBeenCalledWith({
            violationId: 'v1',
            propertyId: 'p1',
            ownerCompanyId: 'c1',
            ownerName: 'ACME LLC',
        });
        expect(dbMock.onConflictDoNothing).toHaveBeenCalled();
    });

    it('diffAndStore — an already-alerted twin exists — flags duplicate but still stores the match', async () => {
        dbMock.selectQueue.push([{ id: 'other-violation' }]); // a CE/TMP twin already alerted

        const res = await diffAndStore({ violation: violation(), ...PARAMS });

        expect(res).toEqual({ isDuplicate: true });
        expect(dbMock.insert).toHaveBeenCalledTimes(1);
    });

    it('diffAndStore — empty normalized address — skips the dedup query entirely', async () => {
        const res = await diffAndStore({
            violation: violation(),
            ...PARAMS,
            normalizedAddress: '',
        });

        expect(res).toEqual({ isDuplicate: false });
        // Too weak a key to dedup → no lookup, but the match is still recorded.
        expect(dbMock.select).not.toHaveBeenCalled();
        expect(dbMock.insert).toHaveBeenCalledTimes(1);
    });

    it('diffAndStore — violation has no date — skips the dedup query entirely', async () => {
        const res = await diffAndStore({
            violation: violation({ violationDate: null }),
            ...PARAMS,
        });

        expect(res).toEqual({ isDuplicate: false });
        expect(dbMock.select).not.toHaveBeenCalled();
        expect(dbMock.insert).toHaveBeenCalledTimes(1);
    });

    it('diffAndStore — individual owner — stores a match with a null owner company', async () => {
        dbMock.selectQueue.push([]);

        await diffAndStore({
            violation: violation(),
            propertyId: 'p1',
            ownerCompanyId: null,
            ownerName: 'JANE DOE',
            normalizedAddress: '123 MAIN ST',
        });

        expect(dbMock.values).toHaveBeenCalledWith({
            violationId: 'v1',
            propertyId: 'p1',
            ownerCompanyId: null,
            ownerName: 'JANE DOE',
        });
    });
});
