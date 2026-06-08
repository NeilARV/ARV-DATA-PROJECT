import { z } from 'zod';

// Fixed reaction set — no custom emoji (Phase 1).
export const MASTERMIND_REACTION_EMOJIS = ['👍', '👎', '😀', '😢', '😂', '❤️'] as const;

// Channel names are lowercase slugs, e.g. "san-diego-market".
export const createChannelSchema = z.object({
    name: z
        .string()
        .min(1, 'Channel name is required')
        .max(80, 'Channel name must be 80 characters or less')
        .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
    description: z.string().max(500, 'Description must be 500 characters or less').nullish(),
});

export const updateChannelSchema = z.object({
    name: createChannelSchema.shape.name.optional(),
    description: z.string().max(500, 'Description must be 500 characters or less').nullish(),
});

// content is TipTap HTML.
export const createMessageSchema = z.object({
    content: z.string().min(1, 'Message cannot be empty').max(10000, 'Message is too long'),
    parentMessageId: z.string().uuid().optional(), // Phase 2 threads
});

export const updateMessageSchema = z.object({
    content: z.string().min(1, 'Message cannot be empty').max(10000, 'Message is too long'),
});

export const reactionSchema = z.object({
    emoji: z.enum(MASTERMIND_REACTION_EMOJIS, { message: 'Unsupported reaction' }),
});

// Attachment metadata recorded after a successful Supabase Storage upload.
export const messageAttachmentSchema = z.object({
    fileUrl: z.string().url('A valid file URL is required'),
    fileName: z.string().min(1, 'File name is required').max(255),
    fileType: z.string().min(1, 'File type is required').max(255),
    fileSizeBytes: z.number().int().positive('File size must be greater than 0'),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type ReactionInput = z.infer<typeof reactionSchema>;
export type MessageAttachmentInput = z.infer<typeof messageAttachmentSchema>;
