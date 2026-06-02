import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { mockState } from '../../helpers/mockStorage';

// ── Mock server/storage ────────────────────────────────────────────────────
vi.mock('server/storage', async () => {
    const { mockState } = await import('../../helpers/mockStorage');
    const mockBuilder = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
            if (mockState.shouldThrow)
                return Promise.reject(mockState.error ?? new Error('DB error'));
            return Promise.resolve(mockState.roleRows);
        }),
    };
    return { db: { select: vi.fn().mockReturnValue(mockBuilder) } };
});

import { requireRole } from '../../../server/middleware/requireRole';

// ── Helpers ────────────────────────────────────────────────────────────────
function createMocks(userId?: string) {
    const req = {
        session: { userId },
        path: '/test',
        sessionID: 'test-session-id',
    } as unknown as Request;

    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    return { req, res, next };
}

// ── Tests ──────────────────────────────────────────────────────────────────
beforeEach(() => {
    mockState.roleRows = [];
    mockState.shouldThrow = false;
    mockState.error = null;
});

describe('requireRole middleware', () => {
    describe('unauthenticated', () => {
        it('returns 401 and does not call next() when session has no userId', async () => {
            const { req, res, next } = createMocks(undefined);
            await requireRole(['admin'])(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('authorized', () => {
        it('calls next() and does not send a response when user has the required role', async () => {
            mockState.roleRows = [{ roleName: 'admin' }];
            const { req, res, next } = createMocks('user-123');
            await requireRole(['admin'])(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('calls next() when user has one of several allowed roles', async () => {
            mockState.roleRows = [{ roleName: 'owner' }];
            const { req, res, next } = createMocks('user-123');
            await requireRole(['admin', 'owner', 'relationship-manager'])(req, res, next);
            expect(next).toHaveBeenCalled();
        });
    });

    describe('forbidden', () => {
        it('returns 403 and does not call next() when user has no matching role', async () => {
            mockState.roleRows = [];
            const { req, res, next } = createMocks('user-123');
            await requireRole(['admin', 'owner'])(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('returns 500 and does not call next() when the DB query throws', async () => {
            mockState.shouldThrow = true;
            mockState.error = new Error('DB connection failed');
            const { req, res, next } = createMocks('user-123');
            await requireRole(['admin'])(req, res, next);
            expect(res.status).toHaveBeenCalledWith(500);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
