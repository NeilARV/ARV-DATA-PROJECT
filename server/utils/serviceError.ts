import type { Response } from 'express';

// Base for service-layer errors that carry an HTTP status. Domain services subclass this
// (e.g. MessageServiceError) so call sites read clearly and can be matched by type, while
// controllers translate any ServiceError into its status via handleServiceError.
export class ServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

// Standard controller catch: a known ServiceError surfaces its status/message; anything else is
// logged with context and returned as a generic 500 (never leaking internals to the client).
export function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof ServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}
