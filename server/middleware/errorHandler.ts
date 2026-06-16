import type { Request, Response, NextFunction } from 'express';
import { ServiceError } from 'server/lib/error';

// Builds the client-facing error body for a ServiceError, including `errors` only when the error
// carries details (e.g. Zod issues).
function serviceErrorBody(err: ServiceError): { message: string; errors?: unknown } {
    return err.details === undefined
        ? { message: err.message }
        : { message: err.message, errors: err.details };
}

// http-errors / body-parser style errors carry `expose: true` for safe-to-show 4xx (e.g. malformed
// JSON, payload too large). Anything without it is treated as an unexpected bug.
function isExposableHttpError(
    err: unknown,
): err is { status?: number; statusCode?: number; message: string; expose: true } {
    return (
        typeof err === 'object' &&
        err !== null &&
        'expose' in err &&
        (err as { expose?: unknown }).expose === true
    );
}

// Global error handler — the single place errors become HTTP responses. Operational errors
// (ServiceError, exposable http-errors) surface their status/message; everything else is logged
// with context and returned as a generic 500 so internals never leak to the client.
export function errorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
): void {
    // A response already started streaming — let Express abort the connection rather than
    // attempting a second send.
    if (res.headersSent) {
        next(err);
        return;
    }

    if (err instanceof ServiceError) {
        res.status(err.statusCode).json(serviceErrorBody(err));
        return;
    }

    if (isExposableHttpError(err)) {
        res.status(err.status ?? err.statusCode ?? 400).json({ message: err.message });
        return;
    }

    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
}

// Transitional controller catch helper — being replaced by `throw` + the global errorHandler as
// each domain migrates to asyncHandler. A known ServiceError surfaces its status/message; anything
// else is logged with context and returned as a generic 500 (never leaking internals).
export function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof ServiceError) {
        res.status(err.statusCode).json(serviceErrorBody(err));
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}
