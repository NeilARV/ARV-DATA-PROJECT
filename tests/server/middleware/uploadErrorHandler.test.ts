import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { handleUploadError } from 'server/middleware/uploadErrorHandler';

function makeRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
}

describe('handleUploadError', () => {
    it('maps a multer Error (wrong type / too large) to a 400 with its message', () => {
        const res = makeRes();
        const next = vi.fn() as unknown as NextFunction;
        handleUploadError(new Error('File too large'), {} as Request, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ message: 'File too large' });
        expect(next).not.toHaveBeenCalled();
    });

    it('passes a non-Error through to the next error handler', () => {
        const res = makeRes();
        const next = vi.fn() as unknown as NextFunction;
        const notAnError = { weird: true };
        handleUploadError(notAnError, {} as Request, res, next);
        expect(next).toHaveBeenCalledWith(notAnError);
        expect(res.status).not.toHaveBeenCalled();
    });
});
