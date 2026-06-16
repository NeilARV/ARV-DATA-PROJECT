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
