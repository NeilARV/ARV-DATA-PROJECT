import type {
    MastermindMessageWire,
    MessageReactionSummary,
    ReactionChangedEvent,
} from '@shared/mastermind/events';

// The cache key the message list reads from. Live socket events and history loads both write
// here, so Part 5's list must use this same key. Value: a flat ascending MastermindMessageWire[].
export function messagesQueryKey(channelId: string) {
    return ['/api/channels', channelId, 'messages'] as const;
}

// The cache key the channel pin bar reads from.
export function pinQueryKey(channelId: string) {
    return ['/api/channels', channelId, 'pin'] as const;
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

// Applies an edit/delete to the cached list WITHOUT clobbering reactions/attachments. A
// channel-wide update can't carry per-viewer reaction state, so we merge content/flags only
// and keep the existing reactions & attachments. Unknown messages are ignored (not inserted).
export function applyMessageMutation(
    existing: MastermindMessageWire[],
    incoming: MastermindMessageWire,
): MastermindMessageWire[] {
    return existing.map((m) =>
        m.id === incoming.id
            ? {
                  ...incoming,
                  reactions: m.reactions,
                  attachments: incoming.isDeleted ? [] : m.attachments,
              }
            : m,
    );
}

// Applies a reaction add/remove delta to the cached list. reactedByMe flips only when the
// acting user is the viewer, which is how a single broadcast yields correct per-viewer pills.
export function applyReactionDelta(
    existing: MastermindMessageWire[],
    event: Pick<ReactionChangedEvent, 'messageId' | 'emoji' | 'userId' | 'action'>,
    viewerId: string | undefined,
): MastermindMessageWire[] {
    const isMine = event.userId === viewerId;
    return existing.map((m) => {
        if (m.id !== event.messageId) return m;

        const reactions = m.reactions.slice();
        const idx = reactions.findIndex((r) => r.emoji === event.emoji);
        const current: MessageReactionSummary =
            idx >= 0 ? reactions[idx] : { emoji: event.emoji, count: 0, reactedByMe: false };

        const nextCount = event.action === 'add' ? current.count + 1 : current.count - 1;
        const next: MessageReactionSummary = {
            emoji: event.emoji,
            count: Math.max(0, nextCount),
            reactedByMe: isMine ? event.action === 'add' : current.reactedByMe,
        };

        if (next.count <= 0) {
            return { ...m, reactions: reactions.filter((r) => r.emoji !== event.emoji) };
        }
        if (idx >= 0) {
            reactions[idx] = next;
        } else {
            reactions.push(next);
        }
        return { ...m, reactions };
    });
}
