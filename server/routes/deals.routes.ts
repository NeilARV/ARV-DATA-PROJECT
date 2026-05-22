import { Router } from "express";
import { requireSub } from "server/middleware/requireSub";
import {
    getDealsController,
    getDealByIdController,
    createDealController,
    updateDealController,
    deleteDealController,
    requestDealInfoController,
} from "server/controllers/deals/deals.controllers";

const router = Router();

// GET /api/deals — fetch deals; filter by ?userId= or ?msaName=
router.get("/", getDealsController);

// GET /api/deals/:id — fetch a single deal by id
router.get("/:id", getDealByIdController);

// POST /api/deals — create a deal (pro/premium subscription, or team member bypass)
router.post("/", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] }), createDealController);

// PATCH /api/deals/:id — edit own deal (ownership enforced in service)
router.patch("/:id", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] }), updateDealController);

// DELETE /api/deals/:id — delete own deal or any deal (pro/premium or team member)
router.delete("/:id", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] }), deleteDealController);

// POST /api/deals/:id/request-info — send deal details to the requester's RM
router.post("/:id/request-info", requestDealInfoController);

export default router;
