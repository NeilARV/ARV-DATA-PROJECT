import { db } from 'server/storage';
import { messages, channels, messageReactions } from '@database/schemas/mastermind.schema';
import { assertChannelAccessible } from 'server/services/channels/channels.services';
import { ServiceError } from 'server/lib/error';
import { eq, and } from 'drizzle-orm';

export class ReactionServiceError extends ServiceError {}

// Resolves the channel of a reactable message: it must exist and not be deleted. A public channel
// must be non-archived (admin-only ones reactable by admins/owners only); a DM is reactable only
// by its two members. Anyone else 404s — the same existence-hiding rule as the read/write paths.
// Returns the channel id for the broadcast.
async function getReactableChannelId(messageId: string, userId: string): Promise<string> {
    const [row] = await db
        .select({
            channelId: messages.channelId,
            isDeleted: messages.isDeleted,
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
        })
        .from(messages)
        .innerJoin(channels, eq(channels.id, messages.channelId))
        .where(eq(messages.id, messageId))
        .limit(1);

    if (!row || row.isDeleted) {
        throw new ReactionServiceError(404, 'Message not found');
    }
    await assertChannelAccessible(
        row.channelId,
        userId,
        row,
        new ReactionServiceError(404, 'Message not found'),
    );
    return row.channelId;
}

// Idempotent add — re-reacting with the same emoji is a no-op via the unique constraint.
// `changed` is false on a no-op so the caller can skip the broadcast (the delta is +1, and
// broadcasting it on a duplicate would inflate every client's count until the next refetch).
export async function addReaction(
    messageId: string,
    userId: string,
    emoji: string,
): Promise<{ channelId: string; changed: boolean }> {
    const channelId = await getReactableChannelId(messageId, userId);
    const inserted = await db
        .insert(messageReactions)
        .values({ messageId, userId, emoji })
        .onConflictDoNothing()
        .returning({ id: messageReactions.id });
    return { channelId, changed: inserted.length > 0 };
}

// Idempotent remove — removing a reaction that isn't there is a no-op (`changed: false`).
export async function removeReaction(
    messageId: string,
    userId: string,
    emoji: string,
): Promise<{ channelId: string; changed: boolean }> {
    const channelId = await getReactableChannelId(messageId, userId);
    const deleted = await db
        .delete(messageReactions)
        .where(
            and(
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.userId, userId),
                eq(messageReactions.emoji, emoji),
            ),
        )
        .returning({ id: messageReactions.id });
    return { channelId, changed: deleted.length > 0 };
}
