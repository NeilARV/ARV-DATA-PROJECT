import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps an async route handler so a rejected promise is forwarded to Express's error middleware.
// Express 4 does not do this automatically — an un-awaited rejection would otherwise become an
// unhandled rejection instead of a clean error response. On Express 5 this becomes a no-op and
// the wrappers can be removed.
export function asyncHandler(
    handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
    return (req, res, next) => {
        handler(req, res, next).catch(next);
    };
}
