import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { getTestDb, seedTestUser, deleteTestUser } from '../../../helpers/db';
import { cvUploads, cvViolations } from '@database/schemas/code-violations.schema';

// Mock ONLY the Storage boundary — the DB is real (integration), since the dedup/idempotency and
// `failed`-marking logic is exactly the DB-touching code the route test (which mocks the controller)
// and the service unit test (pure parse fns only) never exercise. `upload` is programmable so we can
// drive both the happy path and a storage failure. See access-control.md §5.9a.
const storage = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('server/lib/supabase', () => ({
    getSupabase: () => ({ storage: { from: () => ({ upload: storage.upload }) } }),
    codeViolationStorageBucket: 'test-code-violations-bucket',
}));

import { ingestCodeViolationCsv } from 'server/services/code-violations/code-violations.services';

const USER_ID = '00000000-0000-0000-0000-0000000000d1';

// Every record number this file writes, so cleanup can remove exactly its own rows.
const RECORD_NUMBERS = ['AAA-1', 'AAA-2', 'BBB-1', 'BBB-2', 'CCC-DUP', 'DDD-1'];

const HEADER = 'Date,Record Number,Record Type,Address,Application Name,Status,Description,';

// Build a CSV buffer with the real Accela header (trailing comma → ignored 8th column).
function csv(...rows: string[]): Buffer {
    return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

async function cleanup() {
    const db = getTestDb();
    await db.delete(cvViolations).where(inArray(cvViolations.recordNumber, RECORD_NUMBERS));
    await db.delete(cvUploads).where(eq(cvUploads.uploadedBy, USER_ID));
}

beforeAll(async () => {
    await cleanup();
    await deleteTestUser(USER_ID);
    await seedTestUser(USER_ID);
});

afterAll(async () => {
    await cleanup();
    await deleteTestUser(USER_ID);
});

beforeEach(() => {
    storage.upload.mockReset();
    storage.upload.mockResolvedValue({ error: null });
});

describe('ingestCodeViolationCsv — new complaints (integration)', () => {
    it('inserts each complaint as pending, stamps the upload, and counts them new', async () => {
        const db = getTestDb();
        const res = await ingestCodeViolationCsv({
            buffer: csv(
                '01/15/2026,AAA-1,Code Enforcement,123 Main St,Jane Doe,New,Overgrown lot,',
                '01/16/2026,AAA-2,Code Enforcement,456 Oak Ave,John Roe,New,Trash,',
            ),
            fileName: 'itest-new.csv',
            mimetype: 'text/csv',
            uploadedBy: USER_ID,
        });

        expect(res.rowsTotal).toBe(2);
        expect(res.violationsNew).toBe(2);
        expect(res.skipped).toBe(0);

        const rows = await db
            .select()
            .from(cvViolations)
            .where(inArray(cvViolations.recordNumber, ['AAA-1', 'AAA-2']));
        expect(rows).toHaveLength(2);

        const first = rows.find((r) => r.recordNumber === 'AAA-1');
        expect(first?.processingStatus).toBe('pending');
        expect(first?.notified).toBe(false);
        expect(first?.firstSeenUploadId).toBe(res.uploadId);
        expect(first?.violationDate).toBe('2026-01-15');
        // The consumer computes the normalized address at MATCH time — left null on enqueue.
        expect(first?.normalizedAddress).toBeNull();
    });
});

describe('ingestCodeViolationCsv — re-ingest of an already-seen complaint (integration)', () => {
    it('refreshes Accela fields + address but does not re-queue or re-count it', async () => {
        const db = getTestDb();

        await ingestCodeViolationCsv({
            buffer: csv('01/15/2026,BBB-1,Code Enforcement,1 Old St,Jane Doe,New,First desc,'),
            fileName: 'itest-seed.csv',
            mimetype: 'text/csv',
            uploadedBy: USER_ID,
        });

        // Simulate the consumer having processed BBB-1 to a terminal state with a normalized address.
        await db
            .update(cvViolations)
            .set({ processingStatus: 'complete', normalizedAddress: '1 OLD ST' })
            .where(eq(cvViolations.recordNumber, 'BBB-1'));

        // A later overlapping export: BBB-1 with a corrected address/status + a brand-new BBB-2.
        const res = await ingestCodeViolationCsv({
            buffer: csv(
                '01/20/2026,BBB-1,Code Enforcement,1 New St,Jane Doe,Closed,Updated desc,',
                '01/21/2026,BBB-2,Code Enforcement,2 Elm St,John Roe,New,Another,',
            ),
            fileName: 'itest-overlap.csv',
            mimetype: 'text/csv',
            uploadedBy: USER_ID,
        });

        // Only BBB-2 is new; BBB-1 was already seen.
        expect(res.violationsNew).toBe(1);

        const [bbb1] = await db
            .select()
            .from(cvViolations)
            .where(eq(cvViolations.recordNumber, 'BBB-1'));
        expect(bbb1.statusText).toBe('Closed');
        expect(bbb1.description).toBe('Updated desc');
        expect(bbb1.rawAddress).toBe('1 New St');
        // Not re-queued — the consumer's terminal status survives the re-ingest.
        expect(bbb1.processingStatus).toBe('complete');
        // Nulled so the consumer recomputes it against the corrected address.
        expect(bbb1.normalizedAddress).toBeNull();
    });
});

describe('ingestCodeViolationCsv — duplicate record numbers within one file (integration)', () => {
    it('collapses to a single insert, keeping the first occurrence', async () => {
        const db = getTestDb();
        const res = await ingestCodeViolationCsv({
            buffer: csv(
                '01/15/2026,CCC-DUP,Code Enforcement,1 First St,Jane Doe,New,First occurrence,',
                '01/16/2026,CCC-DUP,Code Enforcement,1 Second St,Jane Doe,Updated,Second occurrence,',
            ),
            fileName: 'itest-dup.csv',
            mimetype: 'text/csv',
            uploadedBy: USER_ID,
        });

        // rowsTotal counts valid parsed rows (both); the in-file dedup collapses them to one insert.
        expect(res.rowsTotal).toBe(2);
        expect(res.violationsNew).toBe(1);

        const rows = await db
            .select()
            .from(cvViolations)
            .where(eq(cvViolations.recordNumber, 'CCC-DUP'));
        expect(rows).toHaveLength(1);
        expect(rows[0].description).toBe('First occurrence');
    });
});

describe('ingestCodeViolationCsv — storage failure (integration)', () => {
    it('marks the audit row failed, rethrows, and enqueues nothing', async () => {
        const db = getTestDb();
        storage.upload.mockResolvedValueOnce({ error: { message: 'bucket exploded' } });

        await expect(
            ingestCodeViolationCsv({
                buffer: csv('01/15/2026,DDD-1,Code Enforcement,9 Z St,Jane Doe,New,x,'),
                fileName: 'itest-fail.csv',
                mimetype: 'text/csv',
                uploadedBy: USER_ID,
            }),
        ).rejects.toThrow(/Storage upload failed/);

        const uploads = await db
            .select()
            .from(cvUploads)
            .where(eq(cvUploads.fileName, 'itest-fail.csv'));
        expect(uploads).toHaveLength(1);
        expect(uploads[0].status).toBe('failed');
        expect(uploads[0].errorMessage).toContain('Storage upload failed');
        expect(uploads[0].finishedAt).not.toBeNull();

        // The parse/insert never ran, so no violation was enqueued.
        const violations = await db
            .select()
            .from(cvViolations)
            .where(eq(cvViolations.recordNumber, 'DDD-1'));
        expect(violations).toHaveLength(0);
    });
});
