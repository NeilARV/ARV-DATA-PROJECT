import { describe, it, expect } from 'vitest';
import { parseApiError } from '../../../client/src/utils/apiError';

describe('parseApiError', () => {
    it('extracts the message from a `${status}: {json}` error', () => {
        const err = new Error('409: {"message":"A group with this name already exists"}');
        expect(parseApiError(err)).toBe('A group with this name already exists');
    });

    it('returns the plain body when the status-prefixed body is not JSON', () => {
        const err = new Error('500: Internal Server Error');
        expect(parseApiError(err)).toBe('Internal Server Error');
    });

    it('returns the whole message when there is no status prefix', () => {
        const err = new Error('Network request failed');
        expect(parseApiError(err)).toBe('Network request failed');
    });

    it('handles a multi-line JSON body (regex spans newlines)', () => {
        const err = new Error('400: {\n  "message": "Invalid request data"\n}');
        expect(parseApiError(err)).toBe('Invalid request data');
    });

    it('falls back for a non-Error value', () => {
        expect(parseApiError(null)).toBe('Something went wrong');
        expect(parseApiError('boom', 'custom fallback')).toBe('custom fallback');
    });

    it('falls back for an Error with an empty message', () => {
        expect(parseApiError(new Error(''), 'nothing here')).toBe('nothing here');
    });
});
