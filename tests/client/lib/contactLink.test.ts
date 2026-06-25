import { describe, it, expect } from 'vitest';
import { buildContactUrl } from '../../../client/src/lib/contactLink';

describe('buildContactUrl', () => {
    it('buildContactUrl — no args — returns the bare /contact path', () => {
        expect(buildContactUrl()).toBe('/contact');
    });

    it('buildContactUrl — subject only — sets subject and omits message', () => {
        const [path, qs] = buildContactUrl('Request Access').split('?');
        const params = new URLSearchParams(qs);
        expect(path).toBe('/contact');
        expect(params.get('subject')).toBe('Request Access');
        expect(params.has('message')).toBe(false);
    });

    it('buildContactUrl — message only — sets message and omits subject', () => {
        const [path, qs] = buildContactUrl(undefined, 'Please help').split('?');
        const params = new URLSearchParams(qs);
        expect(path).toBe('/contact');
        expect(params.get('message')).toBe('Please help');
        expect(params.has('subject')).toBe(false);
    });

    it('buildContactUrl — subject and message — sets both params', () => {
        const qs = buildContactUrl('Upgrade Account', 'I want pro').split('?')[1];
        const params = new URLSearchParams(qs);
        expect(params.get('subject')).toBe('Upgrade Account');
        expect(params.get('message')).toBe('I want pro');
    });

    it('buildContactUrl — round-trips special characters in the message', () => {
        const message = 'a & b? 50% "off" <now>';
        const qs = buildContactUrl('Other', message).split('?')[1];
        // Parsing the query back yields the original string — encoding is reversible, not lost.
        expect(new URLSearchParams(qs).get('message')).toBe(message);
    });
});
