import { Router } from 'express';
import { requireSub } from 'server/middleware/requireSub';
import { ALL_TEAM_ROLES } from 'server/constants/roles.constants';
import {
    getDealsController,
    getDealByIdController,
    getDealTopBuyersController,
    getDealLocationsController,
    createDealController,
    updateDealController,
    deleteDealController,
    requestDealInfoController,
    submitDealOfferController,
    getDealOffersController,
    deleteDealOfferController,
    getMsasController,
} from 'server/controllers/deals/deals.controllers';

const router = Router();

// App access (any subscription tier or team role) — the whole deals experience is gated.
const requireDealAccess = requireSub(['basic', 'pro', 'premium'], {
    bypassRoles: [...ALL_TEAM_ROLES],
});

// GET /api/deals — fetch deals; filter by ?userId= or ?msaName=
router.get('/', requireDealAccess, getDealsController);

// GET /api/deals/msas — fetch all MSAs for the deal form dropdown (must be before /:id)
router.get('/msas', requireDealAccess, getMsasController);

// GET /api/deals/locations — distinct cities/zips for the location autocomplete (before /:id)
router.get('/locations', requireDealAccess, getDealLocationsController);

// GET /api/deals/:id — fetch a single deal by id
router.get('/:id', requireDealAccess, getDealByIdController);

// GET /api/deals/:id/top-buyers — top buyers for a deal's zip (owner/privileged; enforced in service)
router.get('/:id/top-buyers', requireDealAccess, getDealTopBuyersController);

// POST /api/deals — create a deal (any subscription tier, or team member bypass)
router.post(
    '/',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: [...ALL_TEAM_ROLES],
    }),
    createDealController,
);

// PATCH /api/deals/:id — edit own deal (ownership enforced in service)
router.patch(
    '/:id',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: [...ALL_TEAM_ROLES],
    }),
    updateDealController,
);

// DELETE /api/deals/:id — delete own deal or any deal (any subscription tier or team member)
router.delete(
    '/:id',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: [...ALL_TEAM_ROLES],
    }),
    deleteDealController,
);

// POST /api/deals/:id/request-info — send deal details to the requester's RM
// (basic+ subscription or team role). No longer public.
router.post(
    '/:id/request-info',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: [...ALL_TEAM_ROLES],
    }),
    requestDealInfoController,
);

// POST /api/deals/:id/offers — submit a non-binding offer (basic+ subscription or team role)
router.post(
    '/:id/offers',
    requireSub(['basic', 'pro', 'premium'], {
        bypassRoles: [...ALL_TEAM_ROLES],
    }),
    submitDealOfferController,
);

// GET /api/deals/:id/offers — poster (or privileged team) views offers on a deal
router.get('/:id/offers', getDealOffersController);

// DELETE /api/deals/:id/offers/:offerId — poster (or privileged team) removes an offer
router.delete('/:id/offers/:offerId', deleteDealOfferController);

export default router;
