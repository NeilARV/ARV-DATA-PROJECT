import { Router } from 'express';
import { requireMastermind } from 'server/middleware/requireMastermind';
import { requireRole } from 'server/middleware/requireRole';
import {
    getChannelsController,
    createChannelController,
    updateChannelController,
    archiveChannelController,
    deleteChannelController,
} from 'server/controllers/channels/channels.controllers';

const router = Router();

// GET /api/channels — list public channels (admins may ?includeArchived=true)
router.get('/', requireMastermind, getChannelsController);

// POST /api/channels — create a channel (admin/owner only)
router.post('/', requireRole(['admin', 'owner']), createChannelController);

// PATCH /api/channels/:id — rename / edit description (admin/owner only)
router.patch('/:id', requireRole(['admin', 'owner']), updateChannelController);

// POST /api/channels/:id/archive — soft archive (admin/owner only)
router.post('/:id/archive', requireRole(['admin', 'owner']), archiveChannelController);

// DELETE /api/channels/:id — hard delete; only allowed once archived (admin/owner only)
router.delete('/:id', requireRole(['admin', 'owner']), deleteChannelController);

export default router;
