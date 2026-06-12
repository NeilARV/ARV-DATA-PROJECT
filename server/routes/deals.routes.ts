import { Router } from 'express';
import { requireSub } from 'server/middleware/requireSub';
import {
    getDealsController,
    getDealByIdController,
    createDealController,
    updateDealController,
    deleteDealController,
    requestDealInfoController,
    submitDealOfferController,
    getDealOffersController,
    getMsasController,
} from 'server/controllers/deals/deals.controllers';

const router = Router();

// GET /api/deals — fetch deals; filter by ?userId= or ?msaName=
router.get('/', getDealsController);

// GET /api/deals/msas — fetch all MSAs for the deal form dropdown (must be before /:id)
router.get('/msas', getMsasController);

// GET /api/deals/:id — fetch a single deal by id
router.get('/:id', getDealByIdController);

// POST /api/deals — create a deal (pro/premium subscription, or team member bypass)
router.post(
    '/',
    requireSub(['pro', 'premium'], {
        bypassRoles: ['admin', 'owner', 'relationship-manager', 'member'],
    }),
    createDealController,
);

// PATCH /api/deals/:id — edit own deal (ownership enforced in service)
router.patch(
    '/:id',
    requireSub(['pro', 'premium'], {
        bypassRoles: ['admin', 'owner', 'relationship-manager', 'member'],
    }),
    updateDealController,
);

// DELETE /api/deals/:id — delete own deal or any deal (pro/premium or team member)
router.delete(
    '/:id',
    requireSub(['pro', 'premium'], {
        bypassRoles: ['admin', 'owner', 'relationship-manager', 'member'],
    }),
    deleteDealController,
);

// POST /api/deals/:id/request-info — send deal details to the requester's RM
router.post('/:id/request-info', requestDealInfoController);

// POST /api/deals/:id/offers — submit a non-binding offer (basic+ subscription or team role)
router.post(
    '/:id/offers',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: ['admin', 'owner', 'relationship-manager', 'member'],
    }),
    submitDealOfferController,
);

// GET /api/deals/:id/offers — poster (or privileged team) views offers on a deal
router.get('/:id/offers', getDealOffersController);

export default router;
