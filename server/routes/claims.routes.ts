import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { ClaimsController } from 'server/controllers/claims';

const router = Router();

// GET /api/claims — admin list of claims
router.get(
    '/',
    requireRole(['admin', 'owner', 'relationship-manager']),
    ClaimsController.listClaimsHandler,
);

// PATCH /api/claims/:id — approve or reject a claim
router.patch(
    '/:id',
    requireRole(['admin', 'owner', 'relationship-manager']),
    ClaimsController.reviewClaimHandler,
);

export default router;
