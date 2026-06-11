import type { Request, Response } from 'express';
import {
    getChannelPin,
    setChannelPin,
    removeChannelPin,
    PinServiceError,
} from 'server/services/channels/pins.services';
import { pinMessageSchema } from '@database/validation/mastermind.validation';
import { broadcastToChannel } from 'server/websocket/registry';
import { ServerToClient } from '@shared/mastermind/events';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof PinServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/channels/:id/pin ───────────────────────────────────────────────────────
export async function getChannelPinController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const pinned = await getChannelPin(id, req.session.userId!);
        res.json({ pinned });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching pinned message');
    }
}

// ── POST /api/channels/:id/pin ──────────────────────────────────────────────────────
export async function setChannelPinController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const parsed = pinMessageSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const pinned = await setChannelPin(id, parsed.data.messageId, req.session.userId!);
        broadcastToChannel(id, { type: ServerToClient.MessagePinned, channelId: id, pinned });
        res.json({ pinned });
    } catch (err) {
        handleServiceError(res, err, 'Error pinning message');
    }
}

// ── DELETE /api/channels/:id/pin ────────────────────────────────────────────────────
export async function removeChannelPinController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        await removeChannelPin(id);
        broadcastToChannel(id, { type: ServerToClient.MessagePinned, channelId: id, pinned: null });
        res.json({ pinned: null });
    } catch (err) {
        handleServiceError(res, err, 'Error unpinning message');
    }
}
