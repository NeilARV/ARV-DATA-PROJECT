import type { MastermindMessageWire } from '@shared/mastermind/events';

// The cache key the message list reads from. Live socket events and history loads both write
// here, so Part 5's list must use this same key. Value: a flat ascending MastermindMessageWire[].
export function messagesQueryKey(channelId: string) {
    return ['/api/channels', channelId, 'messages'] as const;
}

// Combines message lists de-duplicated by id (incoming replaces existing), sorted oldest-first.
// This is what makes optimistic sends, socket echoes, and backfill overlap all safe.
export function mergeMessages(
    existing: MastermindMessageWire[],
    incoming: MastermindMessageWire[],
): MastermindMessageWire[] {
    const result = existing.slice();
    const indexById = new Map<string, number>();
    existing.forEach((m, i) => indexById.set(m.id, i));

    incoming.forEach((m) => {
        const idx = indexById.get(m.id);
        if (idx === undefined) {
            indexById.set(m.id, result.length);
            result.push(m);
        } else {
            result[idx] = m;
        }
    });

    result.sort((a, b) => {
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return result;
}
