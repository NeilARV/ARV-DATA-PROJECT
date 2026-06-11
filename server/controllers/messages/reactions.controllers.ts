import type { Request, Response } from 'express';
import {
    addReaction,
    removeReaction,
    ReactionServiceError,
} from 'server/services/messages/reactions.services';
import { reactionSchema } from '@database/validation/mastermind.validation';
import { broadcastToChannel } from 'server/websocket/registry';
import { ServerToClient } from '@shared/mastermind/events';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof ReactionServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── POST /api/messages/:id/reactions ───────────────────────────────────────────────
export async function addReactionController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
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
        if (!UUID_REGEX.test(id)) {
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
