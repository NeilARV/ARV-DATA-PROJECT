// Postgres SQLSTATE for unique_violation. Pre-checks race with concurrent inserts, so callers still
// need to catch this and translate it into a clean 409/duplicate response.
const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    );
}

/**
 * Reads a numeric `statusCode` off an unknown thrown value, if present. Services in this codebase
 * tag domain errors with `Object.assign(new Error(...), { statusCode })`; this lets a controller
 * branch on the code without an `any` cast.
 * @returns the status code, or undefined if the value carries none.
 */
export function getErrorStatusCode(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
        const code = (err as { statusCode?: unknown }).statusCode;
        if (typeof code === 'number') return code;
    }
    return undefined;
}
