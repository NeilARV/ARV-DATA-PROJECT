import { Router } from 'express';
import { requireMastermind } from 'server/middleware/requireMastermind';
import {
    updateMessageController,
    deleteMessageController,
} from 'server/controllers/messages/messages.controllers';

const router = Router();

// PATCH /api/messages/:id — edit own message (author-only, enforced in the service)
router.patch('/:id', requireMastermind, updateMessageController);

// DELETE /api/messages/:id — soft delete own message, or any message as admin/owner
router.delete('/:id', requireMastermind, deleteMessageController);

export default router;
