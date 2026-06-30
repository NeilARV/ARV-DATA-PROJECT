import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import type { MulterRequest } from 'server/middleware/multerTypes';

// Mock the data-access boundaries and the service barrel. The controller's HTTP branching is the
// unit under test; the service is a vi.fn we program per case. InvalidCsvError is imported from the
// real (unmocked) services module so the controller's `instanceof` check resolves to the same class.
const svc = vi.hoisted(() => ({
    ingestCodeViolationCsv: vi.fn(),
    listCodeViolationUploads: vi.fn(),
    getCodeViolationUploadById: vi.fn(),
    approveCodeViolationUpload: vi.fn(),
}));

vi.mock('server/storage', () => ({ db: {} }));
vi.mock('server/lib/supabase', () => ({
    getSupabase: () => ({}),
    codeViolationStorageBucket: 'test-code-violations-bucket',
}));
vi.mock('server/services/code-violations', () => ({ CodeViolationsService: svc }));

import {
    uploadCodeViolationCsv,
    getCodeViolationUpload,
    approveCodeViolationUpload,
} from 'server/controllers/code-violations/code-violations.controllers';
import { InvalidCsvError } from 'server/services/code-violations/code-violations.services';

function makeRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
}

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
    svc.ingestCodeViolationCsv.mockReset();
    svc.getCodeViolationUploadById.mockReset();
    svc.approveCodeViolationUpload.mockReset();
});

describe('getCodeViolationUpload', () => {
    it('getCodeViolationUpload — non-uuid id — returns 404 without querying', async () => {
        const req = { params: { id: 'not-a-uuid' } } as unknown as Request;
        const res = makeRes();
        await getCodeViolationUpload(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(svc.getCodeViolationUploadById).not.toHaveBeenCalled();
    });

    it('getCodeViolationUpload — valid uuid, not found — returns 404', async () => {
        svc.getCodeViolationUploadById.mockResolvedValue(null);
        const req = { params: { id: VALID_UUID } } as unknown as Request;
        const res = makeRes();
        await getCodeViolationUpload(req, res);
        expect(svc.getCodeViolationUploadById).toHaveBeenCalledWith(VALID_UUID);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('getCodeViolationUpload — valid uuid, found — returns the upload', async () => {
        const upload = { id: VALID_UUID, fileName: 'jan.csv' };
        svc.getCodeViolationUploadById.mockResolvedValue(upload);
        const req = { params: { id: VALID_UUID } } as unknown as Request;
        const res = makeRes();
        await getCodeViolationUpload(req, res);
        expect(res.json).toHaveBeenCalledWith({ upload });
    });
});

describe('uploadCodeViolationCsv', () => {
    const file = { buffer: Buffer.from('x'), originalname: 'jan.csv', mimetype: 'text/csv' };

    it('uploadCodeViolationCsv — no session — returns 401', async () => {
        const req = { session: {}, file, body: {} } as unknown as MulterRequest;
        const res = makeRes();
        await uploadCodeViolationCsv(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(svc.ingestCodeViolationCsv).not.toHaveBeenCalled();
    });

    it('uploadCodeViolationCsv — no file — returns 400', async () => {
        const req = { session: { userId: 'u1' }, body: {} } as unknown as MulterRequest;
        const res = makeRes();
        await uploadCodeViolationCsv(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(svc.ingestCodeViolationCsv).not.toHaveBeenCalled();
    });

    it('uploadCodeViolationCsv — invalid source — returns 400', async () => {
        const req = {
            session: { userId: 'u1' },
            file,
            body: { source: 'api' },
        } as unknown as MulterRequest;
        const res = makeRes();
        await uploadCodeViolationCsv(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(svc.ingestCodeViolationCsv).not.toHaveBeenCalled();
    });

    it('uploadCodeViolationCsv — InvalidCsvError from service — returns 400 with message', async () => {
        svc.ingestCodeViolationCsv.mockRejectedValue(new InvalidCsvError('bad header'));
        const req = { session: { userId: 'u1' }, file, body: {} } as unknown as MulterRequest;
        const res = makeRes();
        await uploadCodeViolationCsv(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'bad header' });
    });

    it('uploadCodeViolationCsv — success — returns 201 with the ingest result', async () => {
        const result = { uploadId: 'up1', rowsTotal: 2, violationsNew: 1, skipped: 0 };
        svc.ingestCodeViolationCsv.mockResolvedValue(result);
        const req = { session: { userId: 'u1' }, file, body: {} } as unknown as MulterRequest;
        const res = makeRes();
        await uploadCodeViolationCsv(req, res);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(result);
    });
});

describe('approveCodeViolationUpload', () => {
    it('approveCodeViolationUpload — non-uuid id — returns 404 without calling the service', async () => {
        const req = { params: { id: 'not-a-uuid' } } as unknown as Request;
        const res = makeRes();
        await approveCodeViolationUpload(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(svc.approveCodeViolationUpload).not.toHaveBeenCalled();
    });

    it('approveCodeViolationUpload — service reports not-found — returns 404', async () => {
        svc.approveCodeViolationUpload.mockResolvedValue({ status: 'not-found' });
        const req = { params: { id: VALID_UUID } } as unknown as Request;
        const res = makeRes();
        await approveCodeViolationUpload(req, res);
        expect(svc.approveCodeViolationUpload).toHaveBeenCalledWith(VALID_UUID);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    // The illegal-state-transition contract: approving an upload not in `review` is a 409.
    it('approveCodeViolationUpload — service reports not-in-review — returns 409', async () => {
        svc.approveCodeViolationUpload.mockResolvedValue({ status: 'not-in-review' });
        const req = { params: { id: VALID_UUID } } as unknown as Request;
        const res = makeRes();
        await approveCodeViolationUpload(req, res);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('approveCodeViolationUpload — ok — returns 200 with notify counts', async () => {
        const upload = { id: VALID_UUID, status: 'completed' };
        svc.approveCodeViolationUpload.mockResolvedValue({
            status: 'ok',
            upload,
            violationsNotified: 3,
            emailsSent: 5,
        });
        const req = { params: { id: VALID_UUID } } as unknown as Request;
        const res = makeRes();
        await approveCodeViolationUpload(req, res);
        expect(res.json).toHaveBeenCalledWith({
            upload,
            violationsNotified: 3,
            emailsSent: 5,
        });
    });
});
