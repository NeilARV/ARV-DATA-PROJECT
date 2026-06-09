import { db } from 'server/storage';
import { messages, channels, messageMentions } from '@database/schemas/mastermind.schema';
import { users, userRoles, roles } from '@database/schemas/users.schema';
import { eq, and, or, lt, gt, desc, asc, inArray } from 'drizzle-orm';
import { sanitizeMessageHtml, isHtmlEmpty } from 'server/utils/sanitizeHtml';

export class MessageServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'MessageServiceError';
    }
}

// Default + ceiling for history pages; backfill is capped separately.
const DEFAULT_PAGE_SIZE = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_ID_RE = /data-id="([^"]+)"/g;

// Extracts real user IDs from sanitized message HTML. Broadcast sentinel IDs
// (@here, @channel) are skipped — they expand at notification time (Part 8).
function parseMentionedUserIds(html: string): string[] {
    const ids = new Set<string>();
    let match;
    DATA_ID_RE.lastIndex = 0;
    while ((match = DATA_ID_RE.exec(html)) !== null) {
        if (UUID_RE.test(match[1])) ids.add(match[1]);
    }
    return Array.from(ids);
}

// Returns true if the HTML contains any broadcast-mention sentinel (@here / @channel).
// Sentinels are non-UUID data-id values written by the TipTap mention node.
function hasBroadcastMention(html: string): boolean {
    DATA_ID_RE.lastIndex = 0;
    let match;
    while ((match = DATA_ID_RE.exec(html)) !== null) {
        if (!UUID_RE.test(match[1])) return true;
    }
    return false;
}

export type CreateMessageResult = {
    message: EnrichedMessage;
    mentionedUserIds: string[];
    mentionedEveryone: boolean;
};

// Writes message_mentions rows for the given set of user IDs. Filters to only
// users that actually exist to guard against stale client-side data.
async function persistMentions(messageId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const validRows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, userIds));
    if (validRows.length === 0) return;
    await db
        .insert(messageMentions)
        .values(validRows.map((u) => ({ messageId, mentionedUserId: u.id })))
        .onConflictDoNothing();
}
const MAX_PAGE_SIZE = 50;
const MAX_BACKFILL = 500;

const PRIVILEGED_ROLES = ['admin', 'owner'] as const;

export type EnrichedMessage = {
    id: string;
    channelId: string;
    senderId: string;
    content: string;
    isEdited: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
    senderFirstName: string;
    senderLastName: string;
    senderProfileImageUrl: string | null;
};

// Soft-deleted messages are returned as blank tombstones so the timeline has no gaps.
function toEnriched(row: EnrichedMessage): EnrichedMessage {
    return row.isDeleted ? { ...row, content: '' } : row;
}

async function callerIsPrivileged(callerId: string): Promise<boolean> {
    const rows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, callerId), inArray(roles.name, [...PRIVILEGED_ROLES])))
        .limit(1);
    return rows.length > 0;
}

const ENRICHED_COLUMNS = {
    id: messages.id,
    channelId: messages.channelId,
    senderId: messages.senderId,
    content: messages.content,
    isEdited: messages.isEdited,
    isDeleted: messages.isDeleted,
    createdAt: messages.createdAt,
    updatedAt: messages.updatedAt,
    senderFirstName: users.firstName,
    senderLastName: users.lastName,
    senderProfileImageUrl: users.profileImageUrl,
};

async function getEnrichedMessageById(id: string): Promise<EnrichedMessage | null> {
    const [row] = await db
        .select(ENRICHED_COLUMNS)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.id, id))
        .limit(1);
    return row ? toEnriched(row) : null;
}

// Phase 1: messages live only in public, non-archived channels. Archived/unknown → 404.
async function getReadableChannelOrThrow(channelId: string): Promise<void> {
    const [channel] = await db
        .select({ id: channels.id, type: channels.type, isArchived: channels.isArchived })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

    if (!channel || channel.type !== 'public' || channel.isArchived) {
        throw new MessageServiceError(404, 'Channel not found');
    }
}

// Resolves a cursor/since message id to its ordering keys, scoped to the channel.
async function resolveCursor(
    channelId: string,
    messageId: string,
): Promise<{ createdAt: Date; id: string }> {
    const [row] = await db
        .select({ createdAt: messages.createdAt, id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
        .limit(1);
    if (!row) {
        throw new MessageServiceError(400, 'Invalid cursor');
    }
    return row;
}

// ── List history (newest-first, keyset pagination) ──────────────────────────────
export async function listMessages({
    channelId,
    cursor,
    limit,
}: {
    channelId: string;
    cursor?: string;
    limit?: number;
}): Promise<{ messages: EnrichedMessage[]; nextCursor: string | null }> {
    await getReadableChannelOrThrow(channelId);

    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, limit ?? DEFAULT_PAGE_SIZE));

    const keyset = cursor ? await resolveCursor(channelId, cursor) : null;
    const where = keyset
        ? and(
              eq(messages.channelId, channelId),
              or(
                  lt(messages.createdAt, keyset.createdAt),
                  and(eq(messages.createdAt, keyset.createdAt), lt(messages.id, keyset.id)),
              ),
          )
        : eq(messages.channelId, channelId);

    // Fetch one extra row to determine whether another page exists.
    const rows = await db
        .select(ENRICHED_COLUMNS)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(where)
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;

    return {
        messages: page.map(toEnriched),
        nextCursor: hasMore ? page[page.length - 1].id : null,
    };
}

// ── Reconnect backfill (oldest-first, everything newer than `since`) ─────────────
export async function backfillMessages({
    channelId,
    since,
}: {
    channelId: string;
    since: string;
}): Promise<{ messages: EnrichedMessage[]; hasMore: boolean }> {
    await getReadableChannelOrThrow(channelId);

    const keyset = await resolveCursor(channelId, since);

    const rows = await db
        .select(ENRICHED_COLUMNS)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(
            and(
                eq(messages.channelId, channelId),
                or(
                    gt(messages.createdAt, keyset.createdAt),
                    and(eq(messages.createdAt, keyset.createdAt), gt(messages.id, keyset.id)),
                ),
            ),
        )
        .orderBy(asc(messages.createdAt), asc(messages.id))
        .limit(MAX_BACKFILL + 1);

    const hasMore = rows.length > MAX_BACKFILL;
    const page = hasMore ? rows.slice(0, MAX_BACKFILL) : rows;

    return { messages: page.map(toEnriched), hasMore };
}

// ── Create ──────────────────────────────────────────────────────────────────────
export async function createMessage({
    channelId,
    senderId,
    content,
}: {
    channelId: string;
    senderId: string;
    content: string;
}): Promise<CreateMessageResult> {
    const [channel] = await db
        .select({ id: channels.id, type: channels.type, isArchived: channels.isArchived })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

    if (!channel || channel.type !== 'public') {
        throw new MessageServiceError(404, 'Channel not found');
    }
    if (channel.isArchived) {
        throw new MessageServiceError(403, 'This channel is archived');
    }

    const sanitized = sanitizeMessageHtml(content);
    if (isHtmlEmpty(sanitized)) {
        throw new MessageServiceError(400, 'Message cannot be empty');
    }

    const [created] = await db
        .insert(messages)
        .values({ channelId, senderId, content: sanitized })
        .returning({ id: messages.id });

    const mentionedUserIds = parseMentionedUserIds(sanitized);
    const mentionedEveryone = hasBroadcastMention(sanitized);
    await persistMentions(created.id, mentionedUserIds);

    const enriched = await getEnrichedMessageById(created.id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load created message');
    }
    return { message: enriched, mentionedUserIds, mentionedEveryone };
}

// ── Edit (author only — admins may NOT edit another user's message) ──────────────
export async function updateMessage(
    id: string,
    callerId: string,
    content: string,
): Promise<EnrichedMessage> {
    const [existing] = await db
        .select({ id: messages.id, senderId: messages.senderId, isDeleted: messages.isDeleted })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

    if (!existing) {
        throw new MessageServiceError(404, 'Message not found');
    }
    if (existing.senderId !== callerId) {
        throw new MessageServiceError(403, 'You can only edit your own messages');
    }
    if (existing.isDeleted) {
        throw new MessageServiceError(409, 'Cannot edit a deleted message');
    }

    const sanitized = sanitizeMessageHtml(content);
    if (isHtmlEmpty(sanitized)) {
        throw new MessageServiceError(400, 'Message cannot be empty');
    }

    await db
        .update(messages)
        .set({ content: sanitized, isEdited: true, updatedAt: new Date() })
        .where(eq(messages.id, id));

    // Replace mentions: delete the old set then insert the new one. Not wrapped in
    // a transaction because neon-http is connectionless and doesn't support them.
    // A crash here leaves stale mention rows — acceptable for Phase 1 at this scale.
    await db.delete(messageMentions).where(eq(messageMentions.messageId, id));
    await persistMentions(id, parseMentionedUserIds(sanitized));

    const enriched = await getEnrichedMessageById(id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load updated message');
    }
    return enriched;
}

// ── Soft delete (author OR admin/owner) ──────────────────────────────────────────
export async function softDeleteMessage(id: string, callerId: string): Promise<EnrichedMessage> {
    const [existing] = await db
        .select({ id: messages.id, senderId: messages.senderId, isDeleted: messages.isDeleted })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

    if (!existing) {
        throw new MessageServiceError(404, 'Message not found');
    }
    if (existing.senderId !== callerId && !(await callerIsPrivileged(callerId))) {
        throw new MessageServiceError(403, 'You can only delete your own messages');
    }

    if (!existing.isDeleted) {
        await db
            .update(messages)
            .set({ isDeleted: true, content: '', updatedAt: new Date() })
            .where(eq(messages.id, id));
    }

    const enriched = await getEnrichedMessageById(id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load deleted message');
    }
    return enriched;
}
