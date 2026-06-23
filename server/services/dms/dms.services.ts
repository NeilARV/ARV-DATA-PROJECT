import { db } from 'server/storage';
import { channels, channelMembers, messages } from '@database/schemas/mastermind.schema';
import { users } from '@database/schemas/users.schema';
import { eq, and, ne, inArray, max, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isMastermindEligible } from 'server/middleware/requireMastermind';
import { ServiceError } from 'server/lib/error';
import type { Channel } from '@database/types/mastermind';
import type { DmUserWire } from '@shared/mastermind/events';

export class DmServiceError extends ServiceError {}

// The counterparty's public profile, shared by the sidebar list and the DM header context. This is
// exactly the wire shape returned to the client (DmUserWire), aliased so the two can never drift.
export type DmOtherUser = DmUserWire;

// One open direct-message conversation, denormalized for the sidebar list. `lastMessageAt` is the
// newest non-deleted message time; conversations with none are omitted from the list entirely.
export interface DmConversationSummary {
    channelId: string;
    otherUser: DmOtherUser;
    unreadCount: number;
    lastMessageAt: Date;
}

// The resolve-by-counterparty context for opening a DM page: the counterparty's profile plus the
// channel if one already exists (null for a never-messaged pair — a draft, not yet persisted).
export interface DmContext {
    channel: Channel | null;
    otherUser: DmOtherUser;
}

// A DM channel's name is a deterministic, sorted pair of user ids: `dm:<lo>:<hi>`. This makes the
// existing UNIQUE(channels.name) constraint enforce "exactly one conversation per pair" — the
// get-or-create below can never produce two channels for the same two people. The colon-delimited
// shape can't collide with a user-created channel slug (those are validated `^[a-z0-9-]+$`).
function dmChannelName(a: string, b: string): string {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return `dm:${lo}:${hi}`;
}

/**
 * Resolves the 1:1 DM channel between two users, creating it (and both membership rows) on first
 * use. Idempotent: a second call for the same pair returns the existing channel.
 * @param callerId the initiator (already proven Mastermind-eligible by the route gate)
 * @param otherUserId the counterparty — must also be Mastermind-eligible
 * @returns the DM channel row
 * @throws DmServiceError 400 if messaging yourself; 404 if the counterparty is missing or
 *   ineligible (existence is never disclosed).
 */
export async function getOrCreateDmChannel(callerId: string, otherUserId: string): Promise<Channel> {
    if (callerId === otherUserId) {
        throw new DmServiceError(400, 'You cannot start a conversation with yourself');
    }
    // The caller passed requireMastermind; the counterparty must qualify too. A non-existent or
    // ineligible user is reported as not-found so DM-ability never leaks who has access.
    if (!(await isMastermindEligible(otherUserId))) {
        throw new DmServiceError(404, 'User not found');
    }

    const name = dmChannelName(callerId, otherUserId);

    const [existing] = await db.select().from(channels).where(eq(channels.name, name)).limit(1);
    let channel = existing ?? null;
    if (!channel) {
        const [created] = await db
            .insert(channels)
            .values({ name, type: 'dm', createdBy: callerId })
            .onConflictDoNothing()
            .returning();
        // onConflictDoNothing returns no row if a concurrent request won the race — re-read by name.
        channel =
            created ??
            (await db.select().from(channels).where(eq(channels.name, name)).limit(1))[0] ??
            null;
    }
    if (!channel) {
        throw new DmServiceError(500, 'Failed to create conversation');
    }

    // Idempotent membership — one row per participant, guarded by UNIQUE(channel_id, user_id).
    await db
        .insert(channelMembers)
        .values([
            { channelId: channel.id, userId: callerId, role: 'member' },
            { channelId: channel.id, userId: otherUserId, role: 'member' },
        ])
        .onConflictDoNothing();

    return channel;
}

/**
 * Asserts that `userId` is a participant of the DM `channelId` and returns the counterparty's id.
 * The single guard the message/reaction/read paths reuse so a non-member can never touch a private
 * conversation (the gap the channel-id routes don't cover for message-id-scoped actions).
 * @returns the other participant's user id
 * @throws DmServiceError 404 if the caller is not a member (existence is never disclosed).
 */
// The member user-ids of a channel — the single membership read both DM gates share, so the REST
// guard (assertDmMembership) and the WS gate (isDmMember) can never diverge on who is in a DM.
async function getDmMemberIds(channelId: string): Promise<string[]> {
    const rows = await db
        .select({ userId: channelMembers.userId })
        .from(channelMembers)
        .where(eq(channelMembers.channelId, channelId));
    return rows.map((r) => r.userId);
}

export async function assertDmMembership(channelId: string, userId: string): Promise<string> {
    const memberIds = await getDmMemberIds(channelId);

    if (!memberIds.includes(userId)) {
        throw new DmServiceError(404, 'Conversation not found');
    }
    const other = memberIds.find((id) => id !== userId);
    if (!other) {
        // A DM must have a second participant; a self-only roster is corrupt data, not a real DM.
        throw new DmServiceError(404, 'Conversation not found');
    }
    return other;
}

/**
 * Lists the caller's open DM conversations for the sidebar: the counterparty's profile, unread
 * count, and last-activity time, newest-first. Conversations with no surviving messages are
 * omitted (lazy creation means a real DM always has at least one).
 * @returns DM summaries ordered by most recent message
 */
export async function listDirectMessages(userId: string): Promise<DmConversationSummary[]> {
    const selfMember = alias(channelMembers, 'self_member');
    const otherMember = alias(channelMembers, 'other_member');

    const rows = await db
        .select({
            channelId: channels.id,
            otherUserId: users.id,
            otherFirstName: users.firstName,
            otherLastName: users.lastName,
            otherProfileImageUrl: users.profileImageUrl,
            // Unread = non-deleted messages from the other person the caller hasn't read yet. Unlike
            // public channels (NULL last_read_at → 0), a brand-new DM the recipient has never opened
            // must still accrue unread, so NULL means "count everything not mine".
            unreadCount: sql<number>`COALESCE((
                SELECT COUNT(*)::int FROM messages AS m_ur
                WHERE m_ur.channel_id = ${channels.id}
                  AND m_ur.is_deleted = false
                  AND m_ur.sender_id <> ${userId}
                  AND (${selfMember.lastReadAt} IS NULL OR m_ur.created_at > ${selfMember.lastReadAt})
            ), 0)`,
        })
        .from(channels)
        .innerJoin(
            selfMember,
            and(eq(selfMember.channelId, channels.id), eq(selfMember.userId, userId)),
        )
        .innerJoin(
            otherMember,
            and(eq(otherMember.channelId, channels.id), ne(otherMember.userId, userId)),
        )
        .innerJoin(users, eq(users.id, otherMember.userId))
        .where(eq(channels.type, 'dm'));

    if (rows.length === 0) return [];

    // Last-activity time per conversation in one grouped query (no per-row lookup).
    const channelIds = rows.map((r) => r.channelId);
    const lastRows = await db
        .select({ channelId: messages.channelId, lastMessageAt: max(messages.createdAt) })
        .from(messages)
        .where(and(inArray(messages.channelId, channelIds), eq(messages.isDeleted, false)))
        .groupBy(messages.channelId);
    const lastByChannel = new Map(lastRows.map((r) => [r.channelId, r.lastMessageAt]));

    // Keep only conversations with a surviving message (skip the null-last edge case), then sort
    // newest-first. Building in a loop keeps `lastMessageAt` non-null in the returned type.
    const summaries: DmConversationSummary[] = [];
    for (const r of rows) {
        const lastMessageAt = lastByChannel.get(r.channelId) ?? null;
        if (lastMessageAt === null) continue;
        summaries.push({
            channelId: r.channelId,
            otherUser: {
                id: r.otherUserId,
                firstName: r.otherFirstName,
                lastName: r.otherLastName,
                profileImageUrl: r.otherProfileImageUrl,
            },
            unreadCount: r.unreadCount,
            lastMessageAt,
        });
    }
    return summaries.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

/**
 * Resolves the context for opening a DM page by counterparty id — the counterparty's profile and
 * the existing channel, if any. Read-only: it never creates the channel (creation is on first
 * send), so a never-messaged pair returns `{ channel: null }` for the draft view.
 * @throws DmServiceError 400 if `otherUserId` is the caller; 404 if missing or ineligible.
 */
export async function getDmContext(callerId: string, otherUserId: string): Promise<DmContext> {
    if (callerId === otherUserId) {
        throw new DmServiceError(400, 'You cannot start a conversation with yourself');
    }
    // The profile fetch, eligibility check, and existing-channel lookup are independent — run them
    // concurrently rather than as three serial Neon round-trips (this is the read path for every
    // DM open / draft view). Resolving the channel for an ineligible counterparty is wasted work in
    // the rare 404 case, but the common valid case collapses to a single round-trip.
    const name = dmChannelName(callerId, otherUserId);
    const [otherUserRows, eligible, channelRows] = await Promise.all([
        db
            .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                profileImageUrl: users.profileImageUrl,
            })
            .from(users)
            .where(eq(users.id, otherUserId))
            .limit(1),
        isMastermindEligible(otherUserId),
        db.select().from(channels).where(eq(channels.name, name)).limit(1),
    ]);
    const otherUser = otherUserRows[0];
    if (!otherUser || !eligible) {
        throw new DmServiceError(404, 'User not found');
    }
    return { channel: channelRows[0] ?? null, otherUser };
}

/**
 * Boolean membership check for the WebSocket subscribe gate (where a throw would be awkward).
 * @returns true if the user is a participant of the channel.
 */
export async function isDmMember(channelId: string, userId: string): Promise<boolean> {
    return (await getDmMemberIds(channelId)).includes(userId);
}
