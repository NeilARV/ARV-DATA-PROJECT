import { describe, it, expect } from 'vitest';
import { mergeMessages } from '../../client/src/lib/mastermind-messages';
import type { MastermindMessageWire } from '@shared/mastermind/events';

function msg(id: string, createdAt: string, over: Partial<MastermindMessageWire> = {}): MastermindMessageWire {
    return {
        id,
        channelId: 'c1',
        senderId: 'u1',
        content: `<p>${id}</p>`,
        isEdited: false,
        isDeleted: false,
        createdAt,
        updatedAt: createdAt,
        senderFirstName: 'A',
        senderLastName: 'B',
        senderProfileImageUrl: null,
        ...over,
    };
}

describe('mergeMessages', () => {
    it('appends new messages and sorts oldest-first', () => {
        const result = mergeMessages([msg('m2', '2026-01-02')], [msg('m1', '2026-01-01')]);
        expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('de-duplicates by id, replacing the existing message', () => {
        const existing = [msg('m1', '2026-01-01', { content: '<p>old</p>' })];
        const incoming = [msg('m1', '2026-01-01', { content: '<p>new</p>', isEdited: true })];
        const result = mergeMessages(existing, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('<p>new</p>');
        expect(result[0].isEdited).toBe(true);
    });

    it('replaces a message with its tombstone on delete', () => {
        const existing = [msg('m1', '2026-01-01')];
        const tombstone = msg('m1', '2026-01-01', { isDeleted: true, content: '' });
        const result = mergeMessages(existing, [tombstone]);
        expect(result).toHaveLength(1);
        expect(result[0].isDeleted).toBe(true);
    });

    it('breaks createdAt ties by id', () => {
        const result = mergeMessages([], [msg('b', '2026-01-01'), msg('a', '2026-01-01')]);
        expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it('does not mutate the existing array', () => {
        const existing = [msg('m1', '2026-01-01')];
        mergeMessages(existing, [msg('m2', '2026-01-02')]);
        expect(existing).toHaveLength(1);
    });
});
