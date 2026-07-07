import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../../../server/utils/normalizeEmail';

describe('normalizeEmail', () => {
    it('normalizeEmail — mixed-case address — lowercases it', () => {
        expect(normalizeEmail('Neil@ARVFinance.com')).toBe('neil@arvfinance.com');
    });

    it('normalizeEmail — surrounding whitespace — trims it', () => {
        expect(normalizeEmail('  neil@arvfinance.com  ')).toBe('neil@arvfinance.com');
    });

    it('normalizeEmail — mixed case and whitespace together — trims then lowercases', () => {
        expect(normalizeEmail(' Neil@ARVFinance.com ')).toBe('neil@arvfinance.com');
    });

    it('normalizeEmail — already-normalized address — returns it unchanged', () => {
        expect(normalizeEmail('neil@arvfinance.com')).toBe('neil@arvfinance.com');
    });
});
