import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// The token service imports the db client at module load; mock it so these pure-function
// tests stay hermetic and never touch a real database connection.
vi.mock('server/storage', () => ({ db: {} }));

import { generateRawToken, hashToken } from '../../../../server/services/auth/tokens.services';

describe('generateRawToken', () => {
    it('returns a url-safe base64 string (no padding or unsafe chars)', () => {
        expect(generateRawToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('encodes 32 random bytes as a 43-char base64url string', () => {
        expect(generateRawToken()).toHaveLength(43);
    });

    it('produces a unique token on every call', () => {
        const tokens = new Set(Array.from({ length: 1000 }, () => generateRawToken()));
        expect(tokens.size).toBe(1000);
    });
});

describe('hashToken', () => {
    it('is deterministic for the same input', () => {
        expect(hashToken('some-raw-token')).toBe(hashToken('some-raw-token'));
    });

    it('returns a 64-char lowercase hex SHA-256 digest', () => {
        const hash = hashToken('some-raw-token');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(hash).toBe(crypto.createHash('sha256').update('some-raw-token').digest('hex'));
    });

    it('differs for different inputs', () => {
        expect(hashToken('a')).not.toBe(hashToken('b'));
    });

    it('never returns the raw token itself', () => {
        const raw = generateRawToken();
        expect(hashToken(raw)).not.toBe(raw);
    });
});
