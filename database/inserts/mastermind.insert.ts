import { createInsertSchema } from 'drizzle-zod';
import {
    channels,
    channelMembers,
    messages,
    messageAttachments,
    messageReactions,
    messageMentions,
    pinnedMessages,
    notifications,
} from '../schemas/mastermind.schema';

export const insertChannelSchema = createInsertSchema(channels).omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});

export const insertChannelMemberSchema = createInsertSchema(channelMembers).omit({
    id: true,
    joinedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
    id: true,
    isEdited: true,
    isDeleted: true,
    createdAt: true,
    updatedAt: true,
});

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({
    id: true,
    createdAt: true,
});

export const insertMessageReactionSchema = createInsertSchema(messageReactions).omit({
    id: true,
    createdAt: true,
});

export const insertMessageMentionSchema = createInsertSchema(messageMentions).omit({
    id: true,
    createdAt: true,
});

export const insertPinnedMessageSchema = createInsertSchema(pinnedMessages).omit({
    id: true,
    pinnedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
    id: true,
    isRead: true,
    emailedAt: true,
    createdAt: true,
});
