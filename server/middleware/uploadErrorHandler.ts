import type { Request, Response, NextFunction } from 'express';

/**
 * Express error-handling middleware for multer file uploads.
 *
 * multer reports a rejected file — a wrong MIME type from `fileFilter` or one exceeding the
 * configured size limit (`LIMIT_FILE_SIZE`) — by calling `next(err)` with a plain `Error`/
 * `MulterError`. Neither carries `expose: true`, so without this they reach the global
 * errorHandler and surface as a 500. Both are client input problems, so map any upload error to a
 * 400. Place this immediately *after* the multer middleware in a route chain; as a 4-argument
 * handler it is skipped on a successful upload and only runs when multer passes an error.
 */
export function handleUploadError(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (err instanceof Error) {
        res.status(400).json({ message: err.message });
        return;
    }
    next(err);
}
