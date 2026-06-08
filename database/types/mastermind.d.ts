import { z } from 'zod';
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
import {
    insertChannelSchema,
    insertChannelMemberSchema,
    insertMessageSchema,
    insertMessageAttachmentSchema,
    insertMessageReactionSchema,
    insertMessageMentionSchema,
    insertPinnedMessageSchema,
    insertNotificationSchema,
} from '../inserts/mastermind.insert';

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;

export type ChannelMember = typeof channelMembers.$inferSelect;
export type InsertChannelMember = z.infer<typeof insertChannelMemberSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;

export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = z.infer<typeof insertMessageReactionSchema>;

export type MessageMention = typeof messageMentions.$inferSelect;
export type InsertMessageMention = z.infer<typeof insertMessageMentionSchema>;

export type PinnedMessage = typeof pinnedMessages.$inferSelect;
export type InsertPinnedMessage = z.infer<typeof insertPinnedMessageSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
