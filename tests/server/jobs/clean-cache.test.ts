import { describe, it, expect, vi, beforeEach } from 'vitest';

// The cleanup job owns two effects: deleting expired rows and removing their Storage objects.
// Mock the DB client and the Street View service so we can assert WHICH paths get removed and
// that a still-referenced object is spared — without a real Neon branch or Supabase bucket.
const h = vi.hoisted(() => ({
    // FIFO queue of result arrays returned by successive `db.select()...where()` awaits:
    // [0] = rows to delete, [1] = surviving rows that still reference a candidate path.
    selectQueue: [] as Array<Array<Record<string, unknown>>>,
    selectIdx: { n: 0 },
    deleteWhere: vi.fn(),
    removeStored: vi.fn(),
}));

vi.mock('server/storage', () => {
    const selectBuilder: Record<string, unknown> = {
        from: vi.fn(() => selectBuilder),
        where: vi.fn(() => Promise.resolve(h.selectQueue[h.selectIdx.n++] ?? [])),
    };
    const deleteBuilder = { where: h.deleteWhere };
    return {
        db: {
            select: vi.fn(() => selectBuilder),
            delete: vi.fn(() => deleteBuilder),
        },
    };
});

vi.mock('server/services/properties', () => ({
    StreetviewServices: { removeStoredStreetviewImages: h.removeStored },
}));

import { CleanCache } from 'server/jobs/clean-cache';

const PAST = new Date(Date.now() - 60_000);

function expiredRow(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        id: 'id',
        address: 'a',
        city: 'c',
        state: 's',
        expiresAt: PAST,
        metadataStatus: 'OK',
        storagePath: null,
        ...overrides,
    };
}

beforeEach(() => {
    h.selectQueue = [];
    h.selectIdx.n = 0;
    h.deleteWhere.mockReset().mockResolvedValue({ rowCount: 0 });
    h.removeStored.mockReset().mockResolvedValue(undefined);
});

describe('CleanCache', () => {
    it('CleanCache — nothing expired — removes no storage objects and deletes no rows', async () => {
        h.selectQueue = [[]];

        await CleanCache();

        expect(h.removeStored).not.toHaveBeenCalled();
        expect(h.deleteWhere).not.toHaveBeenCalled();
    });

    it('CleanCache — expired rows with storage paths — removes those objects then deletes the rows', async () => {
        h.selectQueue = [
            [
                expiredRow({ id: '1', storagePath: 'streetview/a.jpg' }),
                expiredRow({ id: '2', storagePath: 'streetview/b.jpg' }),
            ],
            [], // no survivors reference those paths
        ];

        await CleanCache();

        expect(h.removeStored).toHaveBeenCalledTimes(1);
        expect(h.removeStored.mock.calls[0][0]).toEqual(
            expect.arrayContaining(['streetview/a.jpg', 'streetview/b.jpg']),
        );
        expect(h.removeStored.mock.calls[0][0]).toHaveLength(2);
        expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('CleanCache — a path still referenced by a surviving row — is NOT removed', async () => {
        h.selectQueue = [
            [
                expiredRow({ id: '1', storagePath: 'streetview/shared.jpg' }),
                expiredRow({ id: '2', storagePath: 'streetview/gone.jpg' }),
            ],
            [{ storagePath: 'streetview/shared.jpg' }], // a non-expired row shares this object
        ];

        await CleanCache();

        const removed = h.removeStored.mock.calls[0][0];
        expect(removed).toEqual(['streetview/gone.jpg']);
        expect(removed).not.toContain('streetview/shared.jpg');
        // Rows are still deleted regardless of which objects were spared.
        expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('CleanCache — duplicate storage paths across rows — are removed once', async () => {
        h.selectQueue = [
            [
                expiredRow({ id: '1', storagePath: 'streetview/dup.jpg' }),
                expiredRow({ id: '2', storagePath: 'streetview/dup.jpg' }),
            ],
            [],
        ];

        await CleanCache();

        expect(h.removeStored.mock.calls[0][0]).toEqual(['streetview/dup.jpg']);
    });

    it('CleanCache — negative-result rows (no storage path) — deletes rows without touching Storage', async () => {
        h.selectQueue = [
            [expiredRow({ id: '1', metadataStatus: 'ZERO_RESULTS', storagePath: null })],
        ];

        await CleanCache();

        expect(h.removeStored).not.toHaveBeenCalled();
        expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    });
});
