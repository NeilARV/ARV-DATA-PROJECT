import { describe, it, expect, afterEach, vi } from 'vitest';
import { getAppBaseUrl } from '../../../server/utils/appBaseUrl';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('getAppBaseUrl', () => {
    it('getAppBaseUrl — APP_URL unset — falls back to production', () => {
        vi.stubEnv('APP_URL', undefined);
        expect(getAppBaseUrl()).toBe('https://data.arvfinance.com');
    });

    it('getAppBaseUrl — APP_URL empty — falls back to production', () => {
        vi.stubEnv('APP_URL', '');
        expect(getAppBaseUrl()).toBe('https://data.arvfinance.com');
    });

    it('getAppBaseUrl — APP_URL whitespace-only — falls back to production', () => {
        vi.stubEnv('APP_URL', '   ');
        expect(getAppBaseUrl()).toBe('https://data.arvfinance.com');
    });

    it('getAppBaseUrl — APP_URL with https scheme — returns it as-is', () => {
        vi.stubEnv('APP_URL', 'https://staging.arvfinance.com');
        expect(getAppBaseUrl()).toBe('https://staging.arvfinance.com');
    });

    it('getAppBaseUrl — APP_URL without scheme — prefixes http://', () => {
        vi.stubEnv('APP_URL', 'localhost:5000');
        expect(getAppBaseUrl()).toBe('http://localhost:5000');
    });

    it('getAppBaseUrl — APP_URL with trailing slash — strips it', () => {
        vi.stubEnv('APP_URL', 'https://staging.arvfinance.com/');
        expect(getAppBaseUrl()).toBe('https://staging.arvfinance.com');
    });
});
