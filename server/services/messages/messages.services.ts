import { db } from 'server/storage';
import {
    messages,
    channels,
    messageMentions,
    messageAttachments,
    messageReactions,
    pinnedMessages,
} from '@database/schemas/mastermind.schema';
import { users, userRoles, roles } from '@database/schemas/users.schema';
import { eq, and, or, lt, gt, desc, asc, inArray, sql } from 'drizzle-orm';
import { sanitizeMessageHtml, isHtmlEmpty } from 'server/utils/sanitizeHtml';
import {
    getSupabase,
    mastermindStorageBucket,
    mastermindPublicUrlPrefix,
    storagePathFromUrl,
} from 'server/lib/supabase';
import { MASTERMIND_REACTION_EMOJIS } from '@database/validation/mastermind.validation';
import type {
    MessageAttachmentWire,
    MessageReactionSummary,
    MastermindMessageWire,
} from '@shared/mastermind/events';
import type { MessageAttachmentInput } from '@database/validation/mastermind.validation';

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
const MAX_PAGE_SIZE = 50;
const MAX_BACKFILL = 500;

const PRIVILEGED_ROLES = ['admin', 'owner'] as const;

// Sliding-window rate limit: 5 messages per 10 s per user.
// Single-server only — adequate for Phase 1 (Replit Reserved VM).
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5;
const sendTimestamps = new Map<string, number[]>();

// Drops users whose entire window has expired so the map doesn't grow unbounded
// over the life of the process (one entry per distinct sender otherwise).
function pruneRateLimitMap(cutoff: number): void {
    sendTimestamps.forEach((timestamps, userId) => {
        if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
            sendTimestamps.delete(userId);
        }
    });
}

function checkPostRateLimit(userId: string): void {
    const now = Date.now();
    const cutoff = now - RATE_WINDOW_MS;
    pruneRateLimitMap(cutoff);
    const timestamps = (sendTimestamps.get(userId) ?? []).filter((t) => t > cutoff);
    if (timestamps.length >= RATE_MAX) {
        throw new MessageServiceError(429, 'You are sending messages too quickly. Please wait a moment.');
    }
    timestamps.push(now);
    sendTimestamps.set(userId, timestamps);
}

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

type EnrichedMessageRow = {
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

export type EnrichedMessage = EnrichedMessageRow & {
    attachments: MessageAttachmentWire[];
    reactions: MessageReactionSummary[];
};

// Serializes an EnrichedMessage to the wire shape (Date → ISO string). REST/WS responses get
// this conversion implicitly via JSON.stringify; callers that embed a message inside a typed
// wire payload (e.g. the pin) use this to satisfy the contract.
export function toMessageWire(message: EnrichedMessage): MastermindMessageWire {
    return {
        ...message,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
    };
}

// Fixed display order for reaction pills, independent of insertion order.
const EMOJI_ORDER = new Map<string, number>(MASTERMIND_REACTION_EMOJIS.map((e, i) => [e, i]));

// Loads attachments + reaction aggregates for a page of messages in two batched queries
// (no N+1). Soft-deleted messages become blank tombstones with no attachments/reactions.
async function hydrateMessages(
    rows: EnrichedMessageRow[],
    viewerId?: string,
): Promise<EnrichedMessage[]> {
    const liveIds = rows.filter((r) => !r.isDeleted).map((r) => r.id);

    const attachmentsByMessage = new Map<string, MessageAttachmentWire[]>();
    const reactionsByMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();

    if (liveIds.length > 0) {
        const attachmentRows = await db
            .select({
                id: messageAttachments.id,
                messageId: messageAttachments.messageId,
                fileUrl: messageAttachments.fileUrl,
                fileName: messageAttachments.fileName,
                fileType: messageAttachments.fileType,
                fileSizeBytes: messageAttachments.fileSizeBytes,
            })
            .from(messageAttachments)
            .where(inArray(messageAttachments.messageId, liveIds))
            .orderBy(asc(messageAttachments.createdAt), asc(messageAttachments.id));

        for (const row of attachmentRows) {
            const list = attachmentsByMessage.get(row.messageId) ?? [];
            list.push({
                id: row.id,
                fileUrl: row.fileUrl,
                fileName: row.fileName,
                fileType: row.fileType,
                fileSizeBytes: row.fileSizeBytes,
            });
            attachmentsByMessage.set(row.messageId, list);
        }

        const aggregateRows = await db
            .select({
                messageId: messageReactions.messageId,
                emoji: messageReactions.emoji,
                count: sql<number>`COUNT(*)::int`,
            })
            .from(messageReactions)
            .where(inArray(messageReactions.messageId, liveIds))
            .groupBy(messageReactions.messageId, messageReactions.emoji);

        for (const row of aggregateRows) {
            const byEmoji = reactionsByMessage.get(row.messageId) ?? new Map();
            byEmoji.set(row.emoji, { count: row.count, mine: false });
            reactionsByMessage.set(row.messageId, byEmoji);
        }

        if (viewerId) {
            const mineRows = await db
                .select({
                    messageId: messageReactions.messageId,
                    emoji: messageReactions.emoji,
                })
                .from(messageReactions)
                .where(
                    and(
                        inArray(messageReactions.messageId, liveIds),
                        eq(messageReactions.userId, viewerId),
                    ),
                );
            for (const row of mineRows) {
                const entry = reactionsByMessage.get(row.messageId)?.get(row.emoji);
                if (entry) entry.mine = true;
            }
        }
    }

    return rows.map((row) => {
        if (row.isDeleted) {
            return { ...row, content: '', attachments: [], reactions: [] };
        }
        const byEmoji = reactionsByMessage.get(row.id);
        const reactions: MessageReactionSummary[] = byEmoji
            ? Array.from(byEmoji, ([emoji, { count, mine }]) => ({
                  emoji,
                  count,
                  reactedByMe: mine,
              })).sort(
                  (a, b) =>
                      (EMOJI_ORDER.get(a.emoji) ?? 99) - (EMOJI_ORDER.get(b.emoji) ?? 99),
              )
            : [];
        return {
            ...row,
            attachments: attachmentsByMessage.get(row.id) ?? [],
            reactions,
        };
    });
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

export async function getEnrichedMessageById(
    id: string,
    viewerId?: string,
): Promise<EnrichedMessage | null> {
    const [row] = await db
        .select(ENRICHED_COLUMNS)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.id, id))
        .limit(1);
    if (!row) return null;
    const [hydrated] = await hydrateMessages([row], viewerId);
    return hydrated;
}

// Phase 1: messages live only in public, non-archived channels. Archived/unknown → 404.
// Admin-only channels are readable by admins/owners only; for anyone else they 404 (existence
// is never disclosed).
async function getReadableChannelOrThrow(channelId: string, viewerId: string): Promise<void> {
    const [channel] = await db
        .select({
            id: channels.id,
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

    if (!channel || channel.type !== 'public' || channel.isArchived) {
        throw new MessageServiceError(404, 'Channel not found');
    }
    if (channel.isAdminOnly && !(await callerIsPrivileged(viewerId))) {
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
    viewerId,
    cursor,
    limit,
}: {
    channelId: string;
    viewerId: string;
    cursor?: string;
    limit?: number;
}): Promise<{ messages: EnrichedMessage[]; nextCursor: string | null }> {
    await getReadableChannelOrThrow(channelId, viewerId);

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
        messages: await hydrateMessages(page, viewerId),
        nextCursor: hasMore ? page[page.length - 1].id : null,
    };
}

// ── Reconnect backfill (oldest-first, everything newer than `since`) ─────────────
export async function backfillMessages({
    channelId,
    viewerId,
    since,
}: {
    channelId: string;
    viewerId: string;
    since: string;
}): Promise<{ messages: EnrichedMessage[]; hasMore: boolean }> {
    await getReadableChannelOrThrow(channelId, viewerId);

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

    return { messages: await hydrateMessages(page, viewerId), hasMore };
}

// ── Create ──────────────────────────────────────────────────────────────────────
export async function createMessage({
    channelId,
    senderId,
    content,
    attachments = [],
}: {
    channelId: string;
    senderId: string;
    content: string;
    attachments?: MessageAttachmentInput[];
}): Promise<CreateMessageResult> {
    checkPostRateLimit(senderId);

    const [channel] = await db
        .select({
            id: channels.id,
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

    if (!channel || channel.type !== 'public') {
        throw new MessageServiceError(404, 'Channel not found');
    }
    // Hide admin-only channels from non-admins (404 before the archived check leaks nothing).
    if (channel.isAdminOnly && !(await callerIsPrivileged(senderId))) {
        throw new MessageServiceError(404, 'Channel not found');
    }
    if (channel.isArchived) {
        throw new MessageServiceError(403, 'This channel is archived');
    }

    // Never trust a client-supplied file URL — it must point at our own storage bucket.
    for (const attachment of attachments) {
        if (!attachment.fileUrl.startsWith(mastermindPublicUrlPrefix())) {
            throw new MessageServiceError(400, 'Invalid attachment');
        }
    }

    const sanitized = sanitizeMessageHtml(content);
    if (isHtmlEmpty(sanitized) && attachments.length === 0) {
        throw new MessageServiceError(400, 'Message cannot be empty');
    }

    const [created] = await db
        .insert(messages)
        .values({ channelId, senderId, content: sanitized })
        .returning({ id: messages.id });

    if (attachments.length > 0) {
        await db.insert(messageAttachments).values(
            attachments.map((a) => ({
                messageId: created.id,
                fileUrl: a.fileUrl,
                fileName: a.fileName,
                fileType: a.fileType,
                fileSizeBytes: a.fileSizeBytes,
            })),
        );
    }

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

        // A tombstone keeps no files, reactions, or pin. Drop storage objects first, then rows.
        await removeAttachmentStorage(id);
        await db.delete(messageAttachments).where(eq(messageAttachments.messageId, id));
        await db.delete(messageReactions).where(eq(messageReactions.messageId, id));
        await db.delete(pinnedMessages).where(eq(pinnedMessages.messageId, id));
    }

    const enriched = await getEnrichedMessageById(id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load deleted message');
    }
    return enriched;
}

// Best-effort removal of a message's files from Supabase Storage. Storage failures are
// logged but never block the delete — the DB tombstone is the source of truth.
async function removeAttachmentStorage(messageId: string): Promise<void> {
    const rows = await db
        .select({ fileUrl: messageAttachments.fileUrl })
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, messageId));
    if (rows.length === 0) return;

    const paths = rows
        .map((r) => storagePathFromUrl(r.fileUrl, mastermindStorageBucket))
        .filter((p): p is string => p !== null);

    // A stored URL that doesn't map to a storage path can never be deleted — surface it
    // instead of silently leaking the object.
    if (paths.length !== rows.length) {
        console.error(
            `Mastermind delete: ${rows.length - paths.length} attachment URL(s) on message ${messageId} ` +
                `did not map to a storage path; those objects may be orphaned.`,
        );
    }
    if (paths.length === 0) return;

    // Supabase .remove() resolves with { data, error } rather than throwing on an API-level
    // failure (bad path, permissions, RLS). The try/catch only covers transport errors, so the
    // returned error must be inspected too — otherwise a failed delete leaks files with no signal.
    try {
        const { error } = await getSupabase()
            .storage.from(mastermindStorageBucket)
            .remove(paths);
        if (error) {
            console.error(
                `Failed to remove mastermind attachment storage for message ${messageId}:`,
                error.message,
            );
        }
    } catch (err) {
        console.error(`Failed to remove mastermind attachment storage for message ${messageId}:`, err);
    }
}
