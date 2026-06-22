import { db } from 'server/storage';
import {
    messages,
    channels,
    messageMentions,
    messageAttachments,
    messageReactions,
    pinnedMessages,
} from '@database/schemas/mastermind.schema';
import { users } from '@database/schemas/users.schema';
import { eq, and, or, lt, gt, desc, asc, inArray, sql } from 'drizzle-orm';
import { sanitizeMessageHtml, isHtmlEmpty } from 'server/utils/sanitizeHtml';
import { isUuid } from 'server/utils/uuid';
import { clampLimit } from 'server/utils/clampLimit';
import { mastermindPublicUrlPrefix } from 'server/lib/supabase';
import { removeAttachmentStorageByUrls } from 'server/services/messages/attachments.services';
import {
    extractPreviewUrls,
    getPreviewsForUrls,
    ensurePreviewsFetched,
} from 'server/services/messages/linkPreviews.services';
import { MASTERMIND_REACTION_EMOJIS } from '@database/validation/mastermind.validation';
import {
    userIsAdminOrOwner,
    assertChannelAccessible,
} from 'server/services/channels/channels.services';
import { ServiceError } from 'server/lib/error';
import type {
    MessageAttachmentWire,
    MessageReactionSummary,
    MastermindMessageWire,
    LinkPreviewWire,
} from '@shared/mastermind/events';
import type { MessageAttachmentInput } from '@database/validation/mastermind.validation';

export class MessageServiceError extends ServiceError {}

// Default + ceiling for history pages; backfill is capped separately.
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_BACKFILL = 500;

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

const SPAN_TAG_RE = /<span\b[^>]*>/g;
const DATA_ID_ATTR_RE = /data-id="([^"]+)"/;

// Broadcast-mention sentinels — non-UUID data-id values written by the TipTap user-mention node.
// Both fan out to everyone; `@announcement` is admin/owner-only (gated below) and notifies as a
// distinct `announcement` type, while `@channel` is open to all senders.
const CHANNEL_SENTINEL = '@channel';
const ANNOUNCEMENT_SENTINEL = '@announcement';

// Matches a whole @announcement chip element. Mention chips never nest, so a non-greedy match to
// the first </span> is safe. [\s\S] (not .) so a chip whose text contains a newline is still
// stripped — otherwise a tampered multi-line chip would survive and fan out. Used to neutralize a
// tampered @announcement from a non-privileged author (the chip is never offered to them in the UI).
const ANNOUNCEMENT_CHIP_RE = /<span\b[^>]*\bdata-id="@announcement"[^>]*>[\s\S]*?<\/span>/gi;

// Only user-mention chips (data-type="mention") drive notifications. Vendor chips
// (data-type="vendorMention") share the "@" trigger and the data-id="<uuid>" shape but are
// display-only, so they must be excluded here — otherwise a vendor UUID would be processed as
// a phantom user mention.
function userMentionSpans(html: string): string[] {
    return (html.match(SPAN_TAG_RE) ?? []).filter((span) =>
        span.includes('data-type="mention"'),
    );
}

// Extracts real user IDs from sanitized message HTML. Broadcast sentinel IDs
// (@channel, @announcement) are skipped — they expand at notification time.
function parseMentionedUserIds(html: string): string[] {
    const ids = new Set<string>();
    for (const span of userMentionSpans(html)) {
        const match = DATA_ID_ATTR_RE.exec(span);
        if (match && isUuid(match[1])) ids.add(match[1]);
    }
    return Array.from(ids);
}

// Collects the broadcast-mention sentinels present (the non-UUID data-id values on user-mention
// chips, e.g. "@channel" / "@announcement"). Real user mentions (UUID ids) are excluded.
function parseBroadcastSentinels(html: string): Set<string> {
    const sentinels = new Set<string>();
    for (const span of userMentionSpans(html)) {
        const match = DATA_ID_ATTR_RE.exec(span);
        if (match && !isUuid(match[1])) sentinels.add(match[1]);
    }
    return sentinels;
}

// Removes every @announcement chip from sanitized HTML (the admin/owner-only gate).
function stripAnnouncementChips(html: string): string {
    return html.replace(ANNOUNCEMENT_CHIP_RE, '');
}

type CreateMessageResult = {
    message: EnrichedMessage;
    mentionedUserIds: string[];
    // @channel broadcast present (open to all senders).
    mentionedChannel: boolean;
    // @announcement broadcast present (only ever true for an admin/owner author, post-gate).
    mentionedAnnouncement: boolean;
    // Whether the message's channel is admin-only, so the controller can scope the cross-channel
    // activity doorbell to admins/owners (non-admins must never learn about admin-only traffic).
    isAdminOnly: boolean;
    // True when the channel is a 1:1 DM. DMs never fan out mentions (the controller routes a
    // single direct_message notification to the counterparty instead).
    isDm: boolean;
    // The DM counterparty's user id (the notification recipient); null for a public channel.
    dmRecipientId: string | null;
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

type EnrichedMessage = EnrichedMessageRow & {
    attachments: MessageAttachmentWire[];
    reactions: MessageReactionSummary[];
    linkPreviews: LinkPreviewWire[];
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
    const liveRows = rows.filter((r) => !r.isDeleted);
    const liveIds = liveRows.map((r) => r.id);

    const attachmentsByMessage = new Map<string, MessageAttachmentWire[]>();
    const reactionsByMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();

    // Link previews: map each message to the URLs in its HTML, then resolve all of them against
    // the cache in a single batched query (no per-message lookup).
    const urlsByMessage = new Map<string, string[]>();
    const allUrls = new Set<string>();
    for (const row of liveRows) {
        const urls = extractPreviewUrls(row.content);
        if (urls.length > 0) {
            urlsByMessage.set(row.id, urls);
            urls.forEach((url) => allUrls.add(url));
        }
    }
    const previewsByUrl = await getPreviewsForUrls(Array.from(allUrls));

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
            return { ...row, content: '', attachments: [], reactions: [], linkPreviews: [] };
        }
        const linkPreviews = (urlsByMessage.get(row.id) ?? [])
            .map((url) => previewsByUrl.get(url))
            .filter((preview): preview is LinkPreviewWire => preview !== undefined);
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
            linkPreviews,
        };
    });
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

// Resolves a readable channel for the viewer or throws 404. Public channels are readable by any
// eligible user (admin-only ones by admins/owners only); a DM is readable only by its two members.
// Archived/unknown/unsupported types → 404 (existence is never disclosed).
async function getReadableChannelOrThrow(channelId: string, viewerId: string): Promise<void> {
    const [channel] = await db
        .select({
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
        })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

    if (!channel) {
        throw new MessageServiceError(404, 'Channel not found');
    }
    await assertChannelAccessible(
        channelId,
        viewerId,
        channel,
        new MessageServiceError(404, 'Channel not found'),
    );
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

    const pageSize = clampLimit(limit, { fallback: DEFAULT_PAGE_SIZE, max: MAX_PAGE_SIZE });

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
    allowDmChannel = false,
}: {
    channelId: string;
    senderId: string;
    content: string;
    attachments?: MessageAttachmentInput[];
    // DM channels are reachable only through the DM controller (which sets this). The public
    // channel send route leaves it false, so a DM channel id there 404s before any write — its
    // all-users activity doorbell must never fan out a private conversation's existence.
    allowDmChannel?: boolean;
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

    if (!channel) {
        throw new MessageServiceError(404, 'Channel not found');
    }
    // A DM is writable only by its two members; the counterparty is the notification recipient.
    // The public channel send route never serves a DM id — treat it as not-found before any
    // membership lookup so a private conversation's existence can't be probed.
    const isDm = channel.type === 'dm';
    if (isDm && !allowDmChannel) {
        throw new MessageServiceError(404, 'Channel not found');
    }
    // An archived public channel is disclosed but closed to new messages (403), unlike the read
    // paths where it 404s — so the write path passes its own archived error.
    const dmRecipientId = await assertChannelAccessible(
        channelId,
        senderId,
        channel,
        new MessageServiceError(404, 'Channel not found'),
        new MessageServiceError(403, 'This channel is archived'),
    );

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

    // @announcement is admin/owner-only. In an admin-only channel the sender is already known to
    // be admin/owner (404 gate above); elsewhere verify before honoring the chip. A non-privileged
    // author can't select it in the UI, so its presence means tampering — strip it so it neither
    // renders for others nor fans out. DMs never fan out, so the gate is skipped there.
    let finalContent = sanitized;
    if (!isDm && parseBroadcastSentinels(sanitized).has(ANNOUNCEMENT_SENTINEL)) {
        const isPrivileged = channel.isAdminOnly || (await userIsAdminOrOwner(senderId));
        if (!isPrivileged) finalContent = stripAnnouncementChips(sanitized);
    }

    const [created] = await db
        .insert(messages)
        .values({ channelId, senderId, content: finalContent })
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

    // DMs are 1:1 — no @mentions / @channel / @announcement. Skip mention parsing + persistence;
    // the controller sends a single direct_message notification to the counterparty instead.
    const mentionedUserIds = isDm ? [] : parseMentionedUserIds(finalContent);
    const sentinels = isDm ? new Set<string>() : parseBroadcastSentinels(finalContent);
    if (!isDm) await persistMentions(created.id, mentionedUserIds);

    const enriched = await getEnrichedMessageById(created.id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load created message');
    }
    return {
        message: enriched,
        mentionedUserIds,
        mentionedChannel: sentinels.has(CHANNEL_SENTINEL),
        mentionedAnnouncement: sentinels.has(ANNOUNCEMENT_SENTINEL),
        isAdminOnly: channel.isAdminOnly,
        isDm,
        dmRecipientId,
    };
}

// ── Edit (author only — admins may NOT edit another user's message) ──────────────
export async function updateMessage(
    id: string,
    callerId: string,
    content: string,
    attachments?: MessageAttachmentInput[],
): Promise<EnrichedMessage> {
    const [existing] = await db
        .select({
            id: messages.id,
            senderId: messages.senderId,
            isDeleted: messages.isDeleted,
            channelType: channels.type,
        })
        .from(messages)
        .innerJoin(channels, eq(channels.id, messages.channelId))
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
    const isDm = existing.channelType === 'dm';

    const sanitized = sanitizeMessageHtml(content);

    // When the client manages attachments it sends the full desired set, which is authoritative.
    // If the key is omitted entirely, existing attachments are left untouched. Validate the set
    // up front so an invalid edit fails before any write.
    if (attachments !== undefined) {
        for (const attachment of attachments) {
            if (!attachment.fileUrl.startsWith(mastermindPublicUrlPrefix())) {
                throw new MessageServiceError(400, 'Invalid attachment');
            }
        }
        if (isHtmlEmpty(sanitized) && attachments.length === 0) {
            throw new MessageServiceError(400, 'Message cannot be empty');
        }
    } else if (isHtmlEmpty(sanitized)) {
        throw new MessageServiceError(400, 'Message cannot be empty');
    }

    // @announcement is admin/owner-only. Edits are author-only, so a non-privileged author can
    // never legitimately carry one — strip a tampered chip (also covers admin-only channels,
    // since only admins/owners can author there). DMs never fan out, so the gate is skipped there.
    let finalContent = sanitized;
    if (
        !isDm &&
        parseBroadcastSentinels(sanitized).has(ANNOUNCEMENT_SENTINEL) &&
        !(await userIsAdminOrOwner(callerId))
    ) {
        finalContent = stripAnnouncementChips(sanitized);
    }

    await db
        .update(messages)
        .set({ content: finalContent, isEdited: true, updatedAt: new Date() })
        .where(eq(messages.id, id));

    // Replace mentions: delete the old set then insert the new one. Not wrapped in
    // a transaction because neon-http is connectionless and doesn't support them.
    // A crash here leaves stale mention rows — acceptable for Phase 1 at this scale.
    // DMs carry no mentions, so there is nothing to rebuild there.
    if (!isDm) {
        await db.delete(messageMentions).where(eq(messageMentions.messageId, id));
        await persistMentions(id, parseMentionedUserIds(finalContent));
    }

    // Reconcile attachments last: it deletes Supabase storage objects irreversibly, so it must
    // not run ahead of the content update — otherwise a failed edit would still destroy files.
    if (attachments !== undefined) {
        await reconcileAttachments(id, attachments);
    }

    const enriched = await getEnrichedMessageById(id);
    if (!enriched) {
        throw new MessageServiceError(500, 'Failed to load updated message');
    }
    return enriched;
}

// ── Soft delete (author OR admin/owner) ──────────────────────────────────────────
export async function softDeleteMessage(id: string, callerId: string): Promise<EnrichedMessage> {
    const [existing] = await db
        .select({
            id: messages.id,
            senderId: messages.senderId,
            isDeleted: messages.isDeleted,
            channelType: channels.type,
        })
        .from(messages)
        .innerJoin(channels, eq(channels.id, messages.channelId))
        .where(eq(messages.id, id))
        .limit(1);

    if (!existing) {
        throw new MessageServiceError(404, 'Message not found');
    }
    // In a DM, delete is strictly author-only — the admin/owner "delete any message" power must
    // never reach a private conversation. In public channels it still applies.
    const isDm = existing.channelType === 'dm';
    const canDelete =
        existing.senderId === callerId || (!isDm && (await userIsAdminOrOwner(callerId)));
    if (!canDelete) {
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

// Reconciles a message's attachments to the desired set: drops rows (and their storage objects)
// no longer present, then inserts the newly uploaded ones. Matching is by fileUrl, which is
// unique per upload. Not transactional — neon-http is connectionless — but each step is
// idempotent enough for Phase 1.
async function reconcileAttachments(
    messageId: string,
    desired: MessageAttachmentInput[],
): Promise<void> {
    const existingRows = await db
        .select({ id: messageAttachments.id, fileUrl: messageAttachments.fileUrl })
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, messageId));

    const desiredUrls = new Set(desired.map((a) => a.fileUrl));
    const existingUrls = new Set(existingRows.map((r) => r.fileUrl));

    const removed = existingRows.filter((r) => !desiredUrls.has(r.fileUrl));
    const added = desired.filter((a) => !existingUrls.has(a.fileUrl));

    if (removed.length > 0) {
        await removeAttachmentStorageByUrls(
            removed.map((r) => r.fileUrl),
            `message ${messageId}`,
        );
        await db.delete(messageAttachments).where(
            inArray(
                messageAttachments.id,
                removed.map((r) => r.id),
            ),
        );
    }
    if (added.length > 0) {
        await db.insert(messageAttachments).values(
            added.map((a) => ({
                messageId,
                fileUrl: a.fileUrl,
                fileName: a.fileName,
                fileType: a.fileType,
                fileSizeBytes: a.fileSizeBytes,
            })),
        );
    }
}

// Background unfurl: ensures every link in a message is cached, then returns the re-hydrated
// message ONLY if a new preview was actually fetched (so the caller broadcasts a follow-up update
// just once, not on every message that merely repeats an already-cached link). Returns null when
// there is nothing new to show — including for deleted messages.
export async function refreshMessageLinkPreviews(
    messageId: string,
): Promise<EnrichedMessage | null> {
    const [row] = await db
        .select({ content: messages.content, isDeleted: messages.isDeleted })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
    if (!row || row.isDeleted) return null;

    const urls = extractPreviewUrls(row.content);
    if (urls.length === 0) return null;

    const fetchedAny = await ensurePreviewsFetched(urls);
    if (!fetchedAny) return null;

    return getEnrichedMessageById(messageId);
}

// Best-effort removal of a message's files from Supabase Storage. Storage failures are
// logged but never block the delete — the DB tombstone is the source of truth.
async function removeAttachmentStorage(messageId: string): Promise<void> {
    const rows = await db
        .select({ fileUrl: messageAttachments.fileUrl })
        .from(messageAttachments)
        .where(eq(messageAttachments.messageId, messageId));
    await removeAttachmentStorageByUrls(
        rows.map((r) => r.fileUrl),
        `message ${messageId}`,
    );
}
