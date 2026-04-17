import { Router } from "express";
import { requireSub } from "server/middleware/requireSub";
import {
    getDealsController,
    createDealController,
    updateDealController,
    deleteDealController,
} from "server/controllers/deals/deals.controllers";

const router = Router();

// GET /api/deals — fetch deals; filter by ?userId= or ?msaName=
router.get("/", getDealsController);

// POST /api/deals — create a deal (pro/premium subscription, or team member bypass)
router.post("/", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager"] }), createDealController);

// PATCH /api/deals/:id — edit own deal (ownership enforced in service)
router.patch("/:id", updateDealController);

// DELETE /api/deals/:id — delete own deal or any deal (pro/premium or team member)
router.delete("/:id", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager"] }), deleteDealController);

export default router;
