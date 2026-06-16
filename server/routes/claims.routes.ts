import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { PRIVILEGED_ROLES } from 'server/constants/roles.constants';
import { ClaimsController } from 'server/controllers/claims';

const router = Router();

// GET /api/claims — admin list of claims
router.get(
    '/',
    requireRole(PRIVILEGED_ROLES),
    ClaimsController.listClaimsHandler,
);

// PATCH /api/claims/:id — approve or reject a claim
router.patch(
    '/:id',
    requireRole(PRIVILEGED_ROLES),
    ClaimsController.reviewClaimHandler,
);

export default router;
