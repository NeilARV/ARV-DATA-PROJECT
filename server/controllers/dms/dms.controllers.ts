import type { Request, Response } from 'express';
import {
    getOrCreateDmChannel,
    getDmContext,
    listDirectMessages,
} from 'server/services/dms/dms.services';
import { listDmCandidates } from 'server/services/channels/channels.services';
import { createMessage, listMessages } from 'server/services/messages/messages.services';
import { createDirectMessageNotification } from 'server/services/notifications/notifications.services';
import { unfurlMessageLinks } from 'server/controllers/messages/messages.controllers';
import { createMessageSchema } from '@database/validation/mastermind.validation';
import {
    broadcastToChannel,
    broadcastToUser,
    isUserSubscribedToChannel,
} from 'server/websocket/registry';
import { ServerToClient } from '@shared/mastermind/events';
import { isUuid } from 'server/utils/uuid';
import { handleServiceError } from 'server/middleware/errorHandler';

// ── GET /api/dms/candidates ─────────────────────────────────────────────────────────
/** Lists Mastermind-eligible users the caller can start a DM with (everyone but themselves). */
export async function getDmCandidatesController(req: Request, res: Response): Promise<void> {
    try {
        const users = await listDmCandidates(req.session.userId!);
        res.json({ users });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching direct message candidates');
    }
}

// ── GET /api/dms ──────────────────────────────────────────────────────────────────
/** Lists the caller's open DM conversations for the sidebar (counterparty, unread, last activity). */
export async function getDirectMessagesController(req: Request, res: Response): Promise<void> {
    try {
        const conversations = (await listDirectMessages(req.session.userId!)).map((dm) => ({
            channelId: dm.channelId,
            otherUser: dm.otherUser,
            unreadCount: dm.unreadCount,
            lastMessageAt: dm.lastMessageAt.toISOString(),
        }));
        res.json({ conversations });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching direct messages');
    }
}

// ── GET /api/dms/:userId/messages ──────────────────────────────────────────────────
/**
 * Resolves the caller↔`:userId` conversation by counterparty id and returns its history. A pair
 * that has never messaged yields an empty draft (`channelId: null`) — the channel is created on the
 * first send, not here. Returns `{ messages, nextCursor, channelId, otherUser }`.
 */
export async function getDirectMessageHistoryController(
    req: Request,
    res: Response,
): Promise<void> {
    try {
        const { userId } = req.params;
        if (!isUuid(userId)) {
            res.status(400).json({ message: 'Invalid user id' });
            return;
        }

        const callerId = req.session.userId!;
        const { channel, otherUser } = await getDmContext(callerId, userId);
        if (!channel) {
            res.json({ messages: [], nextCursor: null, channelId: null, otherUser });
            return;
        }

        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        const limitParam =
            typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
        const result = await listMessages({
            channelId: channel.id,
            viewerId: callerId,
            cursor,
            limit: Number.isNaN(limitParam) ? undefined : limitParam,
        });

        res.json({
            messages: result.messages,
            nextCursor: result.nextCursor,
            channelId: channel.id,
            otherUser,
        });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching direct messages');
    }
}

// ── POST /api/dms/:userId/messages ─────────────────────────────────────────────────
/**
 * Sends a direct message, creating the conversation on first use. Broadcasts the message to both
 * members' open tabs, bumps the recipient's DM sidebar unread live, and creates a `direct_message`
 * bell notification UNLESS the recipient is already viewing the conversation. Returns `{ message }`.
 * Side effect: fires link unfurling after the response (best-effort).
 */
export async function createDirectMessageController(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.params;
        if (!isUuid(userId)) {
            res.status(400).json({ message: 'Invalid user id' });
            return;
        }

        const parsed = createMessageSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const senderId = req.session.userId!;
        const channel = await getOrCreateDmChannel(senderId, userId);
        const { message, dmRecipientId } = await createMessage({
            channelId: channel.id,
            senderId,
            content: parsed.data.content ?? '',
            attachments: parsed.data.attachments,
            allowDmChannel: true,
        });

        // Live to both members' open tabs. DMs carry no mentions, so the mention fields are inert.
        broadcastToChannel(message.channelId, {
            type: ServerToClient.MessageCreated,
            message: { ...message, mentionedUserIds: [], mentionedEveryone: false },
        });

        if (dmRecipientId) {
            // Private sidebar doorbell — bumps the recipient's DM unread live without a refetch,
            // even while they're viewing another channel. Recipient-only (never the all-users
            // firehose, which would leak the conversation's existence).
            broadcastToUser(dmRecipientId, {
                type: ServerToClient.ChannelActivity,
                channelId: message.channelId,
                mentionedUserIds: [],
                mentionedEveryone: false,
            });

            // Bell notification is secondary to delivery and suppressed when the recipient is
            // already viewing the conversation (they see it live) — never fail the sent message.
            if (!isUserSubscribedToChannel(dmRecipientId, message.channelId)) {
                try {
                    const created = await createDirectMessageNotification({
                        messageId: message.id,
                        channelId: message.channelId,
                        recipientUserId: dmRecipientId,
                        actorId: senderId,
                    });
                    if (created) {
                        const { recipientUserId, ...notification } = created;
                        broadcastToUser(recipientUserId, {
                            type: ServerToClient.NotificationCreated,
                            notification,
                        });
                    }
                } catch (err) {
                    console.error('Error creating direct message notification:', err);
                }
            }
        }

        void unfurlMessageLinks(message.id);

        res.status(201).json({ message });
    } catch (err) {
        handleServiceError(res, err, 'Error sending direct message');
    }
}
