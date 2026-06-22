import { Router } from 'express';
import { requireMastermind } from 'server/middleware/requireMastermind';
import {
    getDmCandidatesController,
    getDirectMessagesController,
    getDirectMessageHistoryController,
    createDirectMessageController,
} from 'server/controllers/dms/dms.controllers';

const router = Router();

// GET /api/dms/candidates — eligible users to start a DM with (declared before /:userId routes)
router.get('/candidates', requireMastermind, getDmCandidatesController);

// GET /api/dms — the caller's open DM conversations (sidebar list)
router.get('/', requireMastermind, getDirectMessagesController);

// GET /api/dms/:userId/messages — resolve the caller↔user DM + its history (empty draft if none)
router.get('/:userId/messages', requireMastermind, getDirectMessageHistoryController);

// POST /api/dms/:userId/messages — send a DM (creates the conversation on first use)
router.post('/:userId/messages', requireMastermind, createDirectMessageController);

export default router;
