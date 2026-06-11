import type { Request, Response } from 'express';
import {
    listMessages,
    backfillMessages,
    createMessage,
    updateMessage,
    softDeleteMessage,
    MessageServiceError,
} from 'server/services/messages/messages.services';
import {
    createMessageSchema,
    updateMessageSchema,
} from '@database/validation/mastermind.validation';
import { createMentionNotifications } from 'server/services/notifications/notifications.services';
import { broadcastToChannel, broadcastToUser } from 'server/websocket/registry';
import { ServerToClient } from '@shared/mastermind/events';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof MessageServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/channels/:id/messages ───────────────────────────────────────────────
export async function getChannelMessagesController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const viewerId = req.session.userId!;
        const since = typeof req.query.since === 'string' ? req.query.since : undefined;
        if (since) {
            const result = await backfillMessages({ channelId: id, viewerId, since });
            res.json(result);
            return;
        }

        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        const limit =
            typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;

        const result = await listMessages({
            channelId: id,
            viewerId,
            cursor,
            limit: Number.isNaN(limit) ? undefined : limit,
        });
        res.json(result);
    } catch (err) {
        handleServiceError(res, err, 'Error fetching messages');
    }
}

// ── POST /api/channels/:id/messages ──────────────────────────────────────────────
export async function createMessageController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const parsed = createMessageSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const { message, mentionedUserIds, mentionedEveryone } = await createMessage({
            channelId: id,
            senderId: req.session.userId!,
            content: parsed.data.content ?? '',
            attachments: parsed.data.attachments,
        });
        broadcastToChannel(message.channelId, {
            type: ServerToClient.MessageCreated,
            message: { ...message, mentionedUserIds, mentionedEveryone },
        });

        // Notification fan-out is secondary to the send — never fail a delivered message.
        try {
            const created = await createMentionNotifications({
                messageId: message.id,
                channelId: message.channelId,
                actorId: req.session.userId!,
                mentionedUserIds,
                mentionedEveryone,
            });
            for (const { recipientUserId, ...notification } of created) {
                broadcastToUser(recipientUserId, {
                    type: ServerToClient.NotificationCreated,
                    notification,
                });
            }
        } catch (err) {
            console.error('Error creating mention notifications:', err);
        }

        res.status(201).json({ message });
    } catch (err) {
        handleServiceError(res, err, 'Error creating message');
    }
}

// ── PATCH /api/messages/:id ───────────────────────────────────────────────────────
export async function updateMessageController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid message id' });
            return;
        }

        const parsed = updateMessageSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const message = await updateMessage(
            id,
            req.session.userId!,
            parsed.data.content ?? '',
            parsed.data.attachments,
        );
        broadcastToChannel(message.channelId, { type: ServerToClient.MessageUpdated, message });
        res.json({ message });
    } catch (err) {
        handleServiceError(res, err, 'Error updating message');
    }
}

// ── DELETE /api/messages/:id ──────────────────────────────────────────────────────
export async function deleteMessageController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid message id' });
            return;
        }

        const message = await softDeleteMessage(id, req.session.userId!);
        broadcastToChannel(message.channelId, { type: ServerToClient.MessageDeleted, message });
        res.json({ message });
    } catch (err) {
        handleServiceError(res, err, 'Error deleting message');
    }
}
