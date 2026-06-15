import crypto from 'crypto';

// Excludes visually ambiguous characters (0/O, 1/l/I) so users can read the
// temp password out of an email without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTempPassword(length: number = 12): string {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return result;
}
