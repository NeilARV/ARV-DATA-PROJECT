import {
    pgTable,
    pgEnum,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    index,
    unique,
    type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// ─── Enums ──────────────────────────────────────────────────────────────────────

// Phase 1 uses only 'public'; 'private'/'dm'/'group_dm' are reserved for Phase 2+.
export const channelTypeEnum = pgEnum('channel_type', ['public', 'private', 'dm', 'group_dm']);

// Channel-scoped role (distinct from the platform-wide ARV team roles).
export const channelMemberRoleEnum = pgEnum('channel_member_role', ['owner', 'admin', 'member']);

// Phase 1 notifications fire only for mentions; more types arrive with their features.
export const notificationTypeEnum = pgEnum('notification_type', ['mention', 'channel_mention']);

// ─── Channels ─────────────────────────────────────────────────────────────────

export const channels = pgTable('channels', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // e.g. "san-diego-market"
    description: text('description'), // channel topic
    type: channelTypeEnum('type').notNull().default('public'),
    // Keep the channel if its creator is deleted.
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    isArchived: boolean('is_archived').notNull().default(false), // archive safety-net
    // When true, the channel is visible/usable by admin/owner ONLY (not member/RM/subscriber).
    // Orthogonal to `type`; enforced in the services, not the route middleware.
    isAdminOnly: boolean('is_admin_only').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Channel members ──────────────────────────────────────────────────────────

export const channelMembers = pgTable(
    'channel_members',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        channelId: uuid('channel_id')
            .notNull()
            .references(() => channels.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: channelMemberRoleEnum('role').notNull().default('member'),
        lastReadAt: timestamp('last_read_at', { withTimezone: true }), // unread calculation
        lastReadMessageId: uuid('last_read_message_id'),
        isMuted: boolean('is_muted').notNull().default(false), // Phase 2 notification level
        joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('uq_channel_members_channel_user').on(t.channelId, t.userId),
        index('idx_channel_members_user_id').on(t.userId), // "which channels am I in?"
    ],
);

// ─── Messages ─────────────────────────────────────────────────────────────────

export const messages = pgTable(
    'messages',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        channelId: uuid('channel_id')
            .notNull()
            .references(() => channels.id, { onDelete: 'cascade' }),
        senderId: uuid('sender_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        // Phase 2 threads — self-reference.
        parentMessageId: uuid('parent_message_id').references((): AnyPgColumn => messages.id, {
            onDelete: 'cascade',
        }),
        content: text('content').notNull(), // TipTap HTML
        isEdited: boolean('is_edited').notNull().default(false),
        isDeleted: boolean('is_deleted').notNull().default(false), // SOFT delete only
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        // history pagination + reconnect backfill
        index('idx_messages_channel_created').on(t.channelId, t.createdAt.desc()),
        index('idx_messages_parent_id').on(t.parentMessageId), // thread loading (Phase 2)
    ],
);

// ─── Message attachments ──────────────────────────────────────────────────────

export const messageAttachments = pgTable(
    'message_attachments',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        fileUrl: text('file_url').notNull(), // Supabase Storage URL
        fileName: text('file_name').notNull(),
        fileType: text('file_type').notNull(), // image/* render inline; others = download
        fileSizeBytes: integer('file_size_bytes').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('idx_message_attachments_message_id').on(t.messageId)],
);

// ─── Message reactions ────────────────────────────────────────────────────────

export const messageReactions = pgTable(
    'message_reactions',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        emoji: text('emoji').notNull(), // from the fixed set
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('uq_message_reactions_message_user_emoji').on(t.messageId, t.userId, t.emoji),
        index('idx_message_reactions_message_id').on(t.messageId),
    ],
);

// ─── Message mentions ─────────────────────────────────────────────────────────

export const messageMentions = pgTable(
    'message_mentions',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        // @here/@channel are expanded to concrete users at notify time.
        mentionedUserId: uuid('mentioned_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        unique('uq_message_mentions_message_user').on(t.messageId, t.mentionedUserId),
        index('idx_message_mentions_user_created').on(t.mentionedUserId, t.createdAt.desc()),
    ],
);

// ─── Pinned messages ──────────────────────────────────────────────────────────

export const pinnedMessages = pgTable(
    'pinned_messages',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        messageId: uuid('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        channelId: uuid('channel_id')
            .notNull()
            .references(() => channels.id, { onDelete: 'cascade' }),
        pinnedBy: uuid('pinned_by').references(() => users.id, { onDelete: 'set null' }),
        pinnedAt: timestamp('pinned_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [unique('uq_pinned_messages_channel').on(t.channelId)], // one pin per channel
);

// ─── Notifications (the bell feed) ────────────────────────────────────────────

export const notifications = pgTable(
    'notifications',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id') // recipient
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: notificationTypeEnum('type').notNull(),
        channelId: uuid('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
        messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }), // deep-link target
        actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }), // who triggered it
        isRead: boolean('is_read').notNull().default(false),
        emailedAt: timestamp('emailed_at', { withTimezone: true }), // supports the ≤3/day email cap
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
        // bell feed + unread count
        index('idx_notifications_user_read_created').on(t.userId, t.isRead, t.createdAt.desc()),
    ],
);
