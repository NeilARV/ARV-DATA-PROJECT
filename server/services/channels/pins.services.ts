import { db } from 'server/storage';
import { messages, channels, pinnedMessages } from '@database/schemas/mastermind.schema';
import { users } from '@database/schemas/users.schema';
import { getEnrichedMessageById, toMessageWire } from 'server/services/messages/messages.services';
import { userIsAdminOrOwner } from 'server/services/channels/channels.services';
import { eq } from 'drizzle-orm';
import type { PinnedMessageWire } from '@shared/mastermind/events';

export class PinServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'PinServiceError';
    }
}

// `viewerId` is supplied on reads (GET pin) to enforce admin-only visibility. Pin set/clear are
// already `requireRole(['admin','owner'])` at the route, so they call without a viewer.
async function getReadableChannelOrThrow(channelId: string, viewerId?: string): Promise<void> {
    const [channel] = await db
        .select({
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);
    if (!channel || channel.type !== 'public' || channel.isArchived) {
        throw new PinServiceError(404, 'Channel not found');
    }
    if (channel.isAdminOnly && viewerId && !(await userIsAdminOrOwner(viewerId))) {
        throw new PinServiceError(404, 'Channel not found');
    }
}

// Builds the pin wire for a channel: the hydrated message plus who pinned it. Returns null
// when there is no pin or the pinned message has since been deleted.
async function buildPinWire(channelId: string, viewerId?: string): Promise<PinnedMessageWire | null> {
    const [pin] = await db
        .select({
            messageId: pinnedMessages.messageId,
            pinnedBy: pinnedMessages.pinnedBy,
            pinnedAt: pinnedMessages.pinnedAt,
            pinnedByFirstName: users.firstName,
            pinnedByLastName: users.lastName,
        })
        .from(pinnedMessages)
        .leftJoin(users, eq(users.id, pinnedMessages.pinnedBy))
        .where(eq(pinnedMessages.channelId, channelId))
        .limit(1);

    if (!pin) return null;

    const message = await getEnrichedMessageById(pin.messageId, viewerId);
    if (!message || message.isDeleted) return null;

    return {
        message: toMessageWire(message),
        pinnedByUserId: pin.pinnedBy,
        pinnedByFirstName: pin.pinnedByFirstName,
        pinnedByLastName: pin.pinnedByLastName,
        pinnedAt: pin.pinnedAt.toISOString(),
    };
}

export async function getChannelPin(
    channelId: string,
    viewerId: string,
): Promise<PinnedMessageWire | null> {
    await getReadableChannelOrThrow(channelId, viewerId);
    return buildPinWire(channelId, viewerId);
}

// Sets or replaces the single pin for a channel. The message must belong to the channel.
export async function setChannelPin(
    channelId: string,
    messageId: string,
    pinnedBy: string,
): Promise<PinnedMessageWire> {
    await getReadableChannelOrThrow(channelId);

    const [message] = await db
        .select({ channelId: messages.channelId, isDeleted: messages.isDeleted })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);

    if (!message || message.channelId !== channelId || message.isDeleted) {
        throw new PinServiceError(404, 'Message not found');
    }

    await db
        .insert(pinnedMessages)
        .values({ channelId, messageId, pinnedBy })
        .onConflictDoUpdate({
            target: pinnedMessages.channelId,
            set: { messageId, pinnedBy, pinnedAt: new Date() },
        });

    const pin = await buildPinWire(channelId, pinnedBy);
    if (!pin) {
        throw new PinServiceError(500, 'Failed to load pinned message');
    }
    return pin;
}

export async function removeChannelPin(channelId: string): Promise<void> {
    await getReadableChannelOrThrow(channelId);
    await db.delete(pinnedMessages).where(eq(pinnedMessages.channelId, channelId));
}
