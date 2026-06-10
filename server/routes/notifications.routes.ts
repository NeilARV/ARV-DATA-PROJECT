import { Router } from 'express';
import { requireMastermind } from 'server/middleware/requireMastermind';
import {
    getNotificationsController,
    markNotificationReadController,
    markAllNotificationsReadController,
} from 'server/controllers/notifications/notifications.controllers';

const router = Router();

// GET /api/notifications — bell feed + unread count (caller's own notifications only)
router.get('/', requireMastermind, getNotificationsController);

// PATCH /api/notifications/read-all — mark all of the caller's notifications read
// (registered before the :id route so "read-all" never matches as a param)
router.patch('/read-all', requireMastermind, markAllNotificationsReadController);

// PATCH /api/notifications/:id/read — mark one notification read (self-scoped)
router.patch('/:id/read', requireMastermind, markNotificationReadController);

export default router;
