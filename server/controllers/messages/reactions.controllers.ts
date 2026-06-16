import type { Request, Response } from 'express';
import { addReaction, removeReaction } from 'server/services/messages/reactions.services';
import { reactionSchema } from '@database/validation/mastermind.validation';
import { broadcastToChannel } from 'server/websocket/registry';
import { ServerToClient } from '@shared/mastermind/events';
import { isUuid } from 'server/utils/uuid';
import { handleServiceError } from 'server/utils/serviceError';

// ── POST /api/messages/:id/reactions ───────────────────────────────────────────────
export async function addReactionController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            res.status(400).json({ message: 'Invalid message id' });
            return;
        }

        const parsed = reactionSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const userId = req.session.userId!;
        const { channelId, changed } = await addReaction(id, userId, parsed.data.emoji);
        // Skip the broadcast on a no-op (duplicate) — broadcasting +1 would inflate counts.
        if (changed) {
            broadcastToChannel(channelId, {
                type: ServerToClient.ReactionChanged,
                messageId: id,
                channelId,
                emoji: parsed.data.emoji,
                userId,
                action: 'add',
            });
        }
        res.status(201).json({ success: true });
    } catch (err) {
        handleServiceError(res, err, 'Error adding reaction');
    }
}

// ── DELETE /api/messages/:id/reactions ─────────────────────────────────────────────
export async function removeReactionController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            res.status(400).json({ message: 'Invalid message id' });
            return;
        }

        const parsed = reactionSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const userId = req.session.userId!;
        const { channelId, changed } = await removeReaction(id, userId, parsed.data.emoji);
        if (changed) {
            broadcastToChannel(channelId, {
                type: ServerToClient.ReactionChanged,
                messageId: id,
                channelId,
                emoji: parsed.data.emoji,
                userId,
                action: 'remove',
            });
        }
        res.json({ success: true });
    } catch (err) {
        handleServiceError(res, err, 'Error removing reaction');
    }
}
