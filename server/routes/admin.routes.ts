import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import {
    checkAdminStatus,
    listWhitelist,
    removeWhitelistEntry,
    patchWhitelistEntry,
    createWhitelistEntry,
} from "server/controllers/admin/admin.controllers";

const router = Router();

const WHITELIST_ROLES = ["admin", "owner", "relationship-manager"] as const;

// Check if user is admin
router.get("/status", checkAdminStatus);

// Return all data from email whitelist (email, msa subscription, relationship manager)
router.get("/whitelist", requireRole([...WHITELIST_ROLES]), listWhitelist);

// Delete a user by id from email whitelist
router.delete("/whitelist/:id", requireRole([...WHITELIST_ROLES]), removeWhitelistEntry);

// Edit an email whitelist object (can edit email, msa subscription and relationship manager)
router.patch("/whitelist/:id", requireRole([...WHITELIST_ROLES]), patchWhitelistEntry);

// Add a new email to email whitelist
router.post("/whitelist", requireRole([...WHITELIST_ROLES]), createWhitelistEntry);

export default router;
