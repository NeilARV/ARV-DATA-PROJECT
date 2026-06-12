import { db } from 'server/storage';
import {
    channels,
    channelMembers,
    messages,
    messageAttachments,
} from '@database/schemas/mastermind.schema';
import { users, subscriptions, userRoles, roles } from '@database/schemas/users.schema';
import type { Channel } from '@database/types/mastermind';
import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm';
import { removeAttachmentStorageByUrls } from 'server/services/messages/attachments.services';

export type ChannelWithUnread = Channel & {
    unreadCount: number;
    hasMention: boolean;
};

export class ChannelServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'ChannelServiceError';
    }
}

// Postgres unique_violation — the channels.name unique constraint. The pre-checks
// below give a clean 409 in the common case; this guards the concurrent race where
// two writers pass the pre-check and one loses at the DB level.
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === PG_UNIQUE_VIOLATION;
}

// Short-term channel ordering until explicit reordering ships: #general first, then the market
// channels (…-market), then everything else (e.g. #first-time-flippers), and finally admin-only
// channels at the very end. The secondary name sort keeps a stable, alphabetical order within
// each group. Replace with a position column when drag-to-reorder lands.
const CHANNEL_DISPLAY_ORDER = sql`CASE
    WHEN ${channels.isAdminOnly} THEN 3
    WHEN ${channels.name} = 'general' THEN 0
    WHEN ${channels.name} LIKE '%-market' THEN 1
    ELSE 2
END`;

// Roles that may see/use an admin-only channel.
const CHANNEL_ADMIN_ROLES = ['admin', 'owner'] as const;

// True if the user holds an admin or owner team role. Gates admin-only channels across the
// channel list, mark-read, mention candidates, message read/write, notification fan-out, and
// the WebSocket subscribe.
export async function userIsAdminOrOwner(userId: string): Promise<boolean> {
    const rows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(eq(userRoles.userId, userId), inArray(roles.name, [...CHANNEL_ADMIN_ROLES])))
        .limit(1);
    return rows.length > 0;
}

// Every user id holding an admin or owner role — the audience for an admin-only channel
// (mention candidates + @channel notification fan-out).
export async function listAdminOwnerUserIds(): Promise<string[]> {
    const rows = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(roles.name, [...CHANNEL_ADMIN_ROLES]));
    return Array.from(new Set(rows.map((r) => r.userId)));
}

// Lists public channels. Archived channels are excluded unless includeArchived is set
// (the controller only honors that flag for admin/owner callers).
export async function listChannels({
    includeArchived = false,
}: {
    includeArchived?: boolean;
}): Promise<Channel[]> {
    const where = includeArchived
        ? eq(channels.type, 'public')
        : and(eq(channels.type, 'public'), eq(channels.isArchived, false));

    return db.select().from(channels).where(where).orderBy(CHANNEL_DISPLAY_ORDER, asc(channels.name));
}

// Returns channels enriched with per-user unread counts and mention flags.
// Unread counts only accrue once the user has visited a channel (NULL last_read_at → 0).
export async function listChannelsWithUnread({
    userId,
    includeArchived = false,
    includeAdminOnly = false,
}: {
    userId: string;
    includeArchived?: boolean;
    includeAdminOnly?: boolean;
}): Promise<ChannelWithUnread[]> {
    const conditions = [eq(channels.type, 'public')];
    if (!includeArchived) conditions.push(eq(channels.isArchived, false));
    // Admin-only channels are hidden from everyone except admins/owners.
    if (!includeAdminOnly) conditions.push(eq(channels.isAdminOnly, false));
    const where = and(...conditions);

    return db
        .select({
            id: channels.id,
            name: channels.name,
            description: channels.description,
            type: channels.type,
            isArchived: channels.isArchived,
            isAdminOnly: channels.isAdminOnly,
            createdBy: channels.createdBy,
            createdAt: channels.createdAt,
            updatedAt: channels.updatedAt,
            unreadCount: sql<number>`CASE
                WHEN ${channelMembers.lastReadAt} IS NULL THEN 0
                ELSE COALESCE((
                    SELECT COUNT(*)::int
                    FROM messages AS m_ur
                    WHERE m_ur.channel_id = ${channels.id}
                    AND m_ur.is_deleted = false
                    AND m_ur.created_at > ${channelMembers.lastReadAt}
                    AND m_ur.sender_id <> ${userId}
                ), 0)
            END`,
            // hasMention only checks message_mentions rows (direct @user mentions).
            // @here / @channel broadcast mentions are intentionally NOT stored per-user
            // (per spec they expand at notification time in Part 8), so a broadcast mention
            // in an unread channel will show as plain unread on page load. The live WS path
            // in Mastermind.tsx handles mentionedEveryone correctly; this gap closes in Part 8.
            hasMention: sql<boolean>`CASE
                WHEN ${channelMembers.lastReadAt} IS NULL THEN false
                ELSE EXISTS (
                    SELECT 1
                    FROM message_mentions AS mm_c
                    JOIN messages AS m_c ON mm_c.message_id = m_c.id
                    WHERE mm_c.mentioned_user_id = ${userId}
                    AND m_c.channel_id = ${channels.id}
                    AND m_c.is_deleted = false
                    AND m_c.created_at > ${channelMembers.lastReadAt}
                )
            END`,
        })
        .from(channels)
        .leftJoin(
            channelMembers,
            and(
                eq(channelMembers.channelId, channels.id),
                eq(channelMembers.userId, userId),
            ),
        )
        .where(where)
        .orderBy(CHANNEL_DISPLAY_ORDER, asc(channels.name));
}

// Upserts the caller's channel_members row to advance last_read_at to now.
// On first visit this creates the row (lazy membership join point).
export async function markChannelRead({
    channelId,
    userId,
}: {
    channelId: string;
    userId: string;
}): Promise<void> {
    // A non-admin must not be able to advance read-state (or lazily create a member row) on an
    // admin-only channel. Treat it as not-found so existence is never disclosed.
    const [channel] = await db
        .select({ type: channels.type, isArchived: channels.isArchived, isAdminOnly: channels.isAdminOnly })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);
    if (!channel || channel.type !== 'public' || channel.isArchived) {
        throw new ChannelServiceError(404, 'Channel not found');
    }
    if (channel.isAdminOnly && !(await userIsAdminOrOwner(userId))) {
        throw new ChannelServiceError(404, 'Channel not found');
    }

    const [latest] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.channelId, channelId), eq(messages.isDeleted, false)))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(1);

    const now = new Date();
    await db
        .insert(channelMembers)
        .values({
            channelId,
            userId,
            role: 'member',
            lastReadAt: now,
            lastReadMessageId: latest?.id ?? null,
            joinedAt: now,
        })
        .onConflictDoUpdate({
            target: [channelMembers.channelId, channelMembers.userId],
            set: { lastReadAt: now, lastReadMessageId: latest?.id ?? null },
        });
}

export async function getChannelById(id: string): Promise<Channel | null> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
    return channel ?? null;
}

export async function createChannel({
    name,
    description,
    createdBy,
}: {
    name: string;
    description?: string | null;
    createdBy: string;
}): Promise<Channel> {
    const [existing] = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.name, name))
        .limit(1);
    if (existing) {
        throw new ChannelServiceError(409, 'A channel with that name already exists');
    }

    try {
        const [created] = await db
            .insert(channels)
            .values({ name, description: description ?? null, createdBy })
            .returning();
        return created;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
        throw err;
    }
}

export async function updateChannel(
    id: string,
    { name, description }: { name?: string; description?: string | null },
): Promise<Channel> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }

    if (name && name !== channel.name) {
        const [clash] = await db
            .select({ id: channels.id })
            .from(channels)
            .where(eq(channels.name, name))
            .limit(1);
        if (clash) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
    }

    try {
        const [updated] = await db
            .update(channels)
            .set({
                name: name ?? channel.name,
                description: description === undefined ? channel.description : description,
                updatedAt: new Date(),
            })
            .where(eq(channels.id, id))
            .returning();
        return updated;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
        throw err;
    }
}

// Soft archive — the first "delete". Reversible safety net before a hard delete.
export async function archiveChannel(id: string): Promise<Channel> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }

    const [archived] = await db
        .update(channels)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(channels.id, id))
        .returning();
    return archived;
}

// ── Mention candidates ────────────────────────────────────────────────────────

const MASTERMIND_TIERS = ['basic', 'pro', 'premium'] as const;
const MASTERMIND_BYPASS_ROLES = ['admin', 'owner', 'relationship-manager', 'member'] as const;

export type MentionCandidate = { id: string; firstName: string; lastName: string };

// Every Mastermind-eligible user id (any qualifying tier OR any bypass role).
// Shared by mention autocomplete and @channel notification fan-out.
export async function listEligibleUserIds(): Promise<string[]> {
    const [byRoleRows, bySubRows] = await Promise.all([
        db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(inArray(roles.name, [...MASTERMIND_BYPASS_ROLES])),
        db
            .select({ userId: users.id })
            .from(users)
            .innerJoin(subscriptions, eq(subscriptions.id, users.subscriptionId))
            .where(inArray(subscriptions.name, [...MASTERMIND_TIERS])),
    ]);

    return Array.from(new Set([...byRoleRows, ...bySubRows].map((r) => r.userId)));
}

// Phase 1: every Mastermind-eligible user is a candidate for @mentions in any public channel.
// For an admin-only channel the pool narrows to admins/owners, so you can't @mention a user who
// can't see the channel. In Phase 2+, private/DM channels can narrow this to actual members.
export async function listChannelMentionCandidates(
    { adminOnly = false }: { adminOnly?: boolean } = {},
): Promise<MentionCandidate[]> {
    const eligibleIds = adminOnly ? await listAdminOwnerUserIds() : await listEligibleUserIds();
    if (eligibleIds.length === 0) return [];

    return db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(inArray(users.id, eligibleIds))
        .orderBy(asc(users.firstName), asc(users.lastName));
}

// Hard delete (cascade) — only permitted once the channel is already archived.
export async function deleteChannel(id: string): Promise<{ id: string }> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }
    if (!channel.isArchived) {
        throw new ChannelServiceError(409, 'Archive the channel before deleting it');
    }

    // The DB cascade drops messages + attachment rows but not their Supabase objects. Collect every
    // attachment URL in the channel and remove the files first; best-effort, so a storage failure is
    // logged (orphaning a file) rather than blocking the delete.
    const attachmentRows = await db
        .select({ fileUrl: messageAttachments.fileUrl })
        .from(messageAttachments)
        .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
        .where(eq(messages.channelId, id));
    await removeAttachmentStorageByUrls(
        attachmentRows.map((r) => r.fileUrl),
        `channel ${id}`,
    );

    await db.delete(channels).where(eq(channels.id, id));
    return { id };
}
