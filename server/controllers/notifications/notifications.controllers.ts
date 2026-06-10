import type { Request, Response } from 'express';
import {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    NotificationServiceError,
} from 'server/services/notifications/notifications.services';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof NotificationServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/notifications ─────────────────────────────────────────────────────────
export async function getNotificationsController(req: Request, res: Response): Promise<void> {
    try {
        const result = await listNotifications({ userId: req.session.userId! });
        res.json(result);
    } catch (err) {
        handleServiceError(res, err, 'Error fetching notifications');
    }
}

// ── PATCH /api/notifications/:id/read ──────────────────────────────────────────────
export async function markNotificationReadController(
    req: Request,
    res: Response,
): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid notification id' });
            return;
        }

        await markNotificationRead(id, req.session.userId!);
        res.status(204).send();
    } catch (err) {
        handleServiceError(res, err, 'Error marking notification as read');
    }
}

// ── PATCH /api/notifications/read-all ──────────────────────────────────────────────
export async function markAllNotificationsReadController(
    req: Request,
    res: Response,
): Promise<void> {
    try {
        const updated = await markAllNotificationsRead(req.session.userId!);
        res.json({ updated });
    } catch (err) {
        handleServiceError(res, err, 'Error marking notifications as read');
    }
}
