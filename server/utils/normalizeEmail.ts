/**
 * Canonicalizes an email address for comparison and lookups: trimmed and lowercased.
 * Mirrors the SQL normalization `lower(trim(email))` used by getUserByEmail, so
 * TS-side and DB-side comparisons can't drift.
 * @returns the normalized address.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}
