import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import {
    getDealsController,
    createDealController,
    updateDealController,
    deleteDealController,
} from "server/controllers/deals/deals.controllers";

const router = Router();

// GET /api/deals — fetch deals; filter by ?userId= or ?msaName=
router.get("/", getDealsController);

// POST /api/deals — post a deal (pro+ only)
router.post("/", requireRole(["pro", "premium", "relationship-manager", "admin", "owner"]), createDealController);

// PATCH /api/deals/:id — edit own deal (ownership enforced in service)
router.patch("/:id", updateDealController);

// DELETE /api/deals/:id — delete own deal or any deal (admin/owner/rm)
router.delete("/:id", requireRole(["pro", "premium", "relationship-manager", "admin", "owner"]), deleteDealController);

export default router;
