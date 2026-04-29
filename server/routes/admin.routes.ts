import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import { AdminController } from "server/controllers/admin";

const router = Router();

const WHITELIST_ROLES = ["admin", "owner", "relationship-manager"] as const;

// Check if user is admin
router.get("/status", AdminController.checkAdminStatus);

// Return all data from email whitelist (email, msa subscription, relationship manager)
router.get("/whitelist", requireRole([...WHITELIST_ROLES]), AdminController.listWhitelist);

// Delete a user by id from email whitelist
router.delete("/whitelist/:id", requireRole([...WHITELIST_ROLES]), AdminController.removeWhitelistEntry);

// Edit an email whitelist object (can edit email, msa subscription and relationship manager)
router.patch("/whitelist/:id", requireRole([...WHITELIST_ROLES]), AdminController.patchWhitelistEntry);

// Add a new email to email whitelist
router.post("/whitelist", requireRole([...WHITELIST_ROLES]), AdminController.createWhitelistEntry);

// Admin update of a user's subscription tier, account types, and relationship manager
router.patch("/users/:id", requireRole([...WHITELIST_ROLES]), AdminController.patchUser);

export default router;
