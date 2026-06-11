import { Router } from 'express';
import { requireMastermind } from 'server/middleware/requireMastermind';
import {
    updateMessageController,
    deleteMessageController,
} from 'server/controllers/messages/messages.controllers';
import {
    addReactionController,
    removeReactionController,
} from 'server/controllers/messages/reactions.controllers';

const router = Router();

// PATCH /api/messages/:id — edit own message (author-only, enforced in the service)
router.patch('/:id', requireMastermind, updateMessageController);

// DELETE /api/messages/:id — soft delete own message, or any message as admin/owner
router.delete('/:id', requireMastermind, deleteMessageController);

// POST /api/messages/:id/reactions — add a reaction (fixed emoji set)
router.post('/:id/reactions', requireMastermind, addReactionController);

// DELETE /api/messages/:id/reactions — remove your reaction
router.delete('/:id/reactions', requireMastermind, removeReactionController);

export default router;
