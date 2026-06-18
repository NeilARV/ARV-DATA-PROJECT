import { db } from 'server/storage';
import { notifications, channels, messages } from '@database/schemas/mastermind.schema';
import { users } from '@database/schemas/users.schema';
import { listEligibleUserIds, listAdminOwnerUserIds } from 'server/services/channels/channels.services';
import { htmlToPlainText } from 'server/utils/sanitizeHtml';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import type { DealBidNotificationMetadata } from '@shared/mastermind/events';

export class NotificationServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'NotificationServiceError';
    }
}

const FEED_LIMIT = 30;
const EXCERPT_MAX_LENGTH = 120;

export type EnrichedNotification = {
    id: string;
    type: 'mention' | 'channel_mention' | 'announcement' | 'deal_bid';
    channelId: string | null;
    channelName: string | null;
    messageId: string | null;
    messageExcerpt: string;
    dealId: number | null;
    metadata: DealBidNotificationMetadata | null;
    actorId: string | null;
    actorFirstName: string | null;
    actorLastName: string | null;
    actorProfileImageUrl: string | null;
    isRead: boolean;
    createdAt: Date;
};

// Creation also reports who each row is for, so the controller can target broadcastToUser.
export type CreatedNotification = EnrichedNotification & { recipientUserId: string };

function toExcerpt(content: string | null): string {
    const text = htmlToPlainText(content ?? '');
    if (text.length <= EXCERPT_MAX_LENGTH) return text;
    return `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`;
}

// ── Create (the mention fan-out) ──────────────────────────────────────────────────
export async function createMentionNotifications({
    messageId,
    channelId,
    actorId,
    mentionedUserIds,
    mentionedChannel,
    mentionedAnnouncement,
}: {
    messageId: string;
    channelId: string;
    actorId: string;
    mentionedUserIds: string[];
    mentionedChannel: boolean;
    mentionedAnnouncement: boolean;
}): Promise<CreatedNotification[]> {
    const mentionedEveryone = mentionedChannel || mentionedAnnouncement;
    if (mentionedUserIds.length === 0 && !mentionedEveryone) return [];

    // mentionedUserIds come from parsing client HTML — keep only users that exist.
    const directIds =
        mentionedUserIds.length > 0
            ? (
                  await db
                      .select({ id: users.id })
                      .from(users)
                      .where(inArray(users.id, mentionedUserIds))
              ).map((r) => r.id)
            : [];

    // In an admin-only channel, no one outside admin/owner may be notified — otherwise a member
    // would get a bell/email deep-linking into a channel they can't open. Scope @channel fan-out
    // to admins/owners and drop direct @user mentions of anyone else.
    const [chan] = await db
        .select({ isAdminOnly: channels.isAdminOnly })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);
    const adminOwnerIds = chan?.isAdminOnly ? new Set(await listAdminOwnerUserIds()) : null;

    // Type precedence: a direct @user mention ('mention') outranks either broadcast, and an
    // @announcement broadcast outranks @channel when both appear. Setting broadcast rows first,
    // then overwriting with direct mentions, yields mention > announcement > channel_mention.
    const recipients = new Map<string, 'mention' | 'channel_mention' | 'announcement'>();
    if (mentionedEveryone) {
        const everyone = adminOwnerIds ? Array.from(adminOwnerIds) : await listEligibleUserIds();
        const broadcastType = mentionedAnnouncement ? 'announcement' : 'channel_mention';
        for (const id of everyone) recipients.set(id, broadcastType);
    }
    for (const id of directIds) {
        if (adminOwnerIds && !adminOwnerIds.has(id)) continue;
        recipients.set(id, 'mention');
    }
    recipients.delete(actorId);

    if (recipients.size === 0) return [];

    const inserted = await db
        .insert(notifications)
        .values(
            Array.from(recipients, ([userId, type]) => ({
                userId,
                type,
                channelId,
                messageId,
                actorId,
            })),
        )
        .returning({
            id: notifications.id,
            userId: notifications.userId,
            type: notifications.type,
            isRead: notifications.isRead,
            createdAt: notifications.createdAt,
        });

    // All rows share one actor/channel/message — enrich with a single lookup.
    const [context] = await db
        .select({
            channelName: channels.name,
            messageContent: messages.content,
            actorFirstName: users.firstName,
            actorLastName: users.lastName,
            actorProfileImageUrl: users.profileImageUrl,
        })
        .from(messages)
        .innerJoin(channels, eq(channels.id, messages.channelId))
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.id, messageId))
        .limit(1);

    return inserted.map((row) => ({
        id: row.id,
        type: row.type,
        channelId,
        channelName: context?.channelName ?? null,
        messageId,
        messageExcerpt: toExcerpt(context?.messageContent ?? null),
        dealId: null,
        metadata: null,
        actorId,
        actorFirstName: context?.actorFirstName ?? null,
        actorLastName: context?.actorLastName ?? null,
        actorProfileImageUrl: context?.actorProfileImageUrl ?? null,
        isRead: row.isRead,
        createdAt: row.createdAt,
        recipientUserId: row.userId,
    }));
}

// ── Create (a deal_bid notification for the deal's poster) ──────────────────────────
export async function createDealBidNotification({
    dealId,
    posterUserId,
    bidderUserId,
    amount,
    address,
}: {
    dealId: number;
    posterUserId: string;
    bidderUserId: string;
    amount: string;
    address: string;
}): Promise<CreatedNotification | null> {
    // A poster bidding on their own deal shouldn't notify themselves.
    if (posterUserId === bidderUserId) return null;

    const metadata: DealBidNotificationMetadata = { amount, address };

    const [inserted] = await db
        .insert(notifications)
        .values({
            userId: posterUserId,
            type: 'deal_bid',
            dealId,
            metadata,
            actorId: bidderUserId,
        })
        .returning({
            id: notifications.id,
            userId: notifications.userId,
            type: notifications.type,
            isRead: notifications.isRead,
            createdAt: notifications.createdAt,
        });

    const [actor] = await db
        .select({
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
        })
        .from(users)
        .where(eq(users.id, bidderUserId))
        .limit(1);

    return {
        id: inserted.id,
        type: inserted.type,
        channelId: null,
        channelName: null,
        messageId: null,
        messageExcerpt: '',
        dealId,
        metadata,
        actorId: bidderUserId,
        actorFirstName: actor?.firstName ?? null,
        actorLastName: actor?.lastName ?? null,
        actorProfileImageUrl: actor?.profileImageUrl ?? null,
        isRead: inserted.isRead,
        createdAt: inserted.createdAt,
        recipientUserId: inserted.userId,
    };
}

// ── Feed + unread count ───────────────────────────────────────────────────────────
export async function listNotifications({
    userId,
    limit = FEED_LIMIT,
}: {
    userId: string;
    limit?: number;
}): Promise<{ notifications: EnrichedNotification[]; unreadCount: number }> {
    const [rows, [unread]] = await Promise.all([
        db
            .select({
                id: notifications.id,
                type: notifications.type,
                channelId: notifications.channelId,
                channelName: channels.name,
                messageId: notifications.messageId,
                messageContent: messages.content,
                messageIsDeleted: messages.isDeleted,
                dealId: notifications.dealId,
                metadata: notifications.metadata,
                actorId: notifications.actorId,
                actorFirstName: users.firstName,
                actorLastName: users.lastName,
                actorProfileImageUrl: users.profileImageUrl,
                isRead: notifications.isRead,
                createdAt: notifications.createdAt,
            })
            .from(notifications)
            .leftJoin(channels, eq(channels.id, notifications.channelId))
            .leftJoin(messages, eq(messages.id, notifications.messageId))
            .leftJoin(users, eq(users.id, notifications.actorId))
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit),
        db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
    ]);

    return {
        notifications: rows.map((row) => ({
            id: row.id,
            type: row.type,
            channelId: row.channelId,
            channelName: row.channelName,
            messageId: row.messageId,
            // A soft-deleted message yields an empty excerpt; the client falls back to a label.
            messageExcerpt: row.messageIsDeleted ? '' : toExcerpt(row.messageContent),
            dealId: row.dealId,
            metadata: row.metadata,
            actorId: row.actorId,
            actorFirstName: row.actorFirstName,
            actorLastName: row.actorLastName,
            actorProfileImageUrl: row.actorProfileImageUrl,
            isRead: row.isRead,
            createdAt: row.createdAt,
        })),
        unreadCount: unread?.count ?? 0,
    };
}

// ── Mark read (self-scoped — a caller can only touch their own rows) ───────────────
export async function markNotificationRead(id: string, userId: string): Promise<void> {
    const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
        .returning({ id: notifications.id });

    if (updated.length === 0) {
        throw new NotificationServiceError(404, 'Notification not found');
    }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
    const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
        .returning({ id: notifications.id });

    return updated.length;
}
