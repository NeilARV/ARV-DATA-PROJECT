import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the two boundaries this unit doesn't own: the DB client and Supabase Storage.
// `h` holds the spies so each test can program the cache row(s) and the storage result.
const h = vi.hoisted(() => ({
    limit: vi.fn(),
    remove: vi.fn(),
}));

vi.mock('server/storage', () => {
    const builder: Record<string, unknown> = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        limit: h.limit,
    };
    return { db: { select: vi.fn(() => builder) } };
});

vi.mock('server/lib/supabase', () => ({
    getSupabase: () => ({ storage: { from: () => ({ remove: h.remove }) } }),
    streetviewStorageBucket: 'test-streetview-bucket',
}));

import {
    getStreetviewImage,
    removeStoredStreetviewImages,
} from 'server/services/properties/streetview.services';

beforeEach(() => {
    h.limit.mockReset();
    h.remove.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('removeStoredStreetviewImages', () => {
    it('removeStoredStreetviewImages — no paths — never calls Supabase', async () => {
        await removeStoredStreetviewImages([]);
        expect(h.remove).not.toHaveBeenCalled();
    });

    it('removeStoredStreetviewImages — only null entries — never calls Supabase', async () => {
        await removeStoredStreetviewImages([null, null]);
        expect(h.remove).not.toHaveBeenCalled();
    });

    it('removeStoredStreetviewImages — drops nulls and removes the valid paths in one batch', async () => {
        await removeStoredStreetviewImages(['streetview/a.jpg', null, 'streetview/b.jpg']);
        expect(h.remove).toHaveBeenCalledTimes(1);
        expect(h.remove).toHaveBeenCalledWith(['streetview/a.jpg', 'streetview/b.jpg']);
    });

    it('removeStoredStreetviewImages — batches more than 100 paths into separate calls', async () => {
        const paths = Array.from({ length: 150 }, (_, i) => `streetview/p${i}.jpg`);
        await removeStoredStreetviewImages(paths);
        expect(h.remove).toHaveBeenCalledTimes(2);
        expect(h.remove.mock.calls[0][0]).toHaveLength(100);
        expect(h.remove.mock.calls[1][0]).toHaveLength(50);
    });

    it('removeStoredStreetviewImages — Supabase returns an error — does not throw', async () => {
        h.remove.mockResolvedValue({ error: { message: 'denied' } });
        await expect(removeStoredStreetviewImages(['streetview/a.jpg'])).resolves.toBeUndefined();
    });

    it('removeStoredStreetviewImages — Supabase rejects — does not throw', async () => {
        h.remove.mockRejectedValue(new Error('network'));
        await expect(removeStoredStreetviewImages(['streetview/a.jpg'])).resolves.toBeUndefined();
    });
});

describe('getStreetviewImage — cache hits', () => {
    it('getStreetviewImage — stored cache hit — returns the CDN publicUrl and no bytes', async () => {
        vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
        h.limit.mockResolvedValueOnce([
            {
                id: '1',
                address: '1 Main St',
                city: 'Denver',
                state: 'CO',
                size: '400x300',
                metadataStatus: 'OK',
                storagePath: 'streetview/abc.jpg',
                imageData: null,
                imageSource: 'streetview',
                contentType: 'image/jpeg',
            },
        ]);

        const result = await getStreetviewImage({
            address: '1 Main St',
            city: 'Denver',
            state: 'CO',
            sfrPropertyId: 123,
        });

        expect(result.available).toBe(true);
        if (!result.available) throw new Error('expected an available result');
        expect(result.publicUrl).toBe(
            'https://test.supabase.co/storage/v1/object/public/test-streetview-bucket/streetview/abc.jpg',
        );
        expect(result.imageData).toBeNull();
        expect(result.imageSource).toBe('streetview');
        // Cache hit must not call Google or touch Storage.
        expect(h.remove).not.toHaveBeenCalled();
    });

    it('getStreetviewImage — cached negative result — returns available:false with the status', async () => {
        h.limit.mockResolvedValueOnce([
            {
                id: '2',
                address: 'nowhere',
                city: '',
                state: '',
                size: '400x300',
                metadataStatus: 'ZERO_RESULTS',
                storagePath: null,
                imageData: null,
                imageSource: null,
                contentType: null,
            },
        ]);

        const result = await getStreetviewImage({
            address: 'nowhere',
            sfrPropertyId: 999,
        });

        expect(result.available).toBe(false);
        if (result.available) throw new Error('expected an unavailable result');
        expect(result.status).toBe('ZERO_RESULTS');
        expect(result.cached).toBe(true);
    });
});
